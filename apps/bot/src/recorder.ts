import { prisma } from '@sentinel/db';
import { effectiveTier, eventDefinition, planLimits, requiredTierForEvent, tierAllows, type PlanTier } from '@sentinel/shared';
import { logQueue, queueConnection } from './queue.js';
import { jsonSafe, redactSecrets } from './utils.js';
import { protectJson, redactText } from './security.js';
import { DISPATCH_ATTEMPTS } from './dispatcher.js';
import { logger } from './logger.js';

export type RecordInput = {
  guildId: string;
  eventKey: string;
  actorId?: string | null;
  targetId?: string | null;
  channelId?: string | null;
  summary: string;
  details?: Record<string, unknown>;
};

type RouteState = { captureEnabled: boolean; enabled: boolean } | null;
type GuildPlan = { planTier: string; planExpiresAt: Date | null } | null;

// Dashboard changes become effective within this window. It keeps the hot path
// (every Gateway event) from issuing database queries per event.
const ROUTE_CACHE_MS = 10_000;
const routeCache = new Map<string, { value: RouteState; expires: number }>();
const planCache = new Map<string, { value: GuildPlan; expires: number }>();

async function getRouteState(guildId: string, eventKey: string): Promise<RouteState> {
  const key = `${guildId}:${eventKey}`;
  const cached = routeCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  const route = await prisma.logRoute.findUnique({
    where: { guildId_eventKey: { guildId, eventKey } },
    select: { captureEnabled: true, enabled: true }
  });
  const value: RouteState = route ? { captureEnabled: route.captureEnabled, enabled: route.enabled } : null;
  routeCache.set(key, { value, expires: Date.now() + ROUTE_CACHE_MS });
  return value;
}

async function getGuildTier(guildId: string): Promise<PlanTier> {
  const cached = planCache.get(guildId);
  let plan: GuildPlan;
  if (cached && cached.expires > Date.now()) {
    plan = cached.value;
  } else {
    plan = await prisma.guildSettings.findUnique({ where: { guildId }, select: { planTier: true, planExpiresAt: true } });
    planCache.set(guildId, { value: plan, expires: Date.now() + ROUTE_CACHE_MS });
  }
  // The expiry is evaluated on every call, so a plan ends on time even
  // while it is cached.
  return plan ? effectiveTier(plan) : 'FREE';
}

export function invalidateRouteCache(guildId?: string) {
  if (!guildId) {
    routeCache.clear();
    planCache.clear();
    return;
  }
  planCache.delete(guildId);
  for (const key of routeCache.keys()) {
    if (key.startsWith(`${guildId}:`)) routeCache.delete(key);
  }
}

const captureAllowed = (eventKey: string, route: RouteState, tier: PlanTier) => {
  if (!tierAllows(tier, requiredTierForEvent(eventDefinition(eventKey)))) return false;
  if (route && !route.captureEnabled) return false;
  return true;
};

const QUOTA_TTL_SECONDS = 2 * 86_400;
const quotaWarned = new Set<string>();
let quotaListener: ((guildId: string, limit: number, tier: PlanTier) => void) | null = null;

/** Called once per server and UTC day when the daily event quota is reached. */
export function onQuotaExceeded(listener: typeof quotaListener) {
  quotaListener = listener;
}

/**
 * Daily event quota per plan, counted in Redis so the hot path never runs a
 * COUNT on LogEvent. Redis being unavailable must not stop logging.
 */
async function withinDailyQuota(guildId: string, tier: PlanTier) {
  const limit = planLimits(tier).eventsPerDay;
  const key = `sentinel:quota:${guildId}:${new Date().toISOString().slice(0, 10)}`;
  try {
    const results = await queueConnection.multi().incr(key).expire(key, QUOTA_TTL_SECONDS).exec();
    const count = Number(results?.[0]?.[1] ?? 0);
    if (count <= limit) return true;
    if (!quotaWarned.has(key)) {
      if (quotaWarned.size > 5000) quotaWarned.clear();
      quotaWarned.add(key);
      logger.warn({ guildId, tier, limit }, 'Daily event quota reached');
      quotaListener?.(guildId, limit, tier);
    }
    return false;
  } catch (error) {
    logger.warn({ guildId, error: redactText(String(error)) }, 'Quota check failed');
    return true;
  }
}

/**
 * Cheap pre-check used by handlers before expensive work such as Audit Log
 * lookups. On database errors it answers true so recordEvent stays the single
 * place that decides.
 */
export async function shouldCapture(guildId: string, eventKey: string) {
  try {
    const [route, tier] = await Promise.all([getRouteState(guildId, eventKey), getGuildTier(guildId)]);
    return captureAllowed(eventKey, route, tier);
  } catch {
    return true;
  }
}

const MAX_DETAILS_BYTES = 64_000;

export function boundDetails(details: Record<string, unknown> | undefined) {
  const sanitizedDetails = jsonSafe(redactSecrets(details ?? {})) as Record<string, unknown>;
  const serializedDetails = JSON.stringify(sanitizedDetails);
  const bytes = Buffer.byteLength(serializedDetails);
  if (bytes <= MAX_DETAILS_BYTES) return sanitizedDetails;
  return { truncated: true, originalBytes: bytes, preview: Buffer.from(serializedDetails).subarray(0, 60_000).toString('utf8') };
}

export async function recordEvent(input: RecordInput) {
  const route = await getRouteState(input.guildId, input.eventKey).catch((error) => {
    logger.warn({ guildId: input.guildId, eventKey: input.eventKey, error: redactText(String(error)) }, 'Route lookup failed');
    return null;
  });
  const tier = await getGuildTier(input.guildId).catch((): PlanTier => 'FREE');
  if (!captureAllowed(input.eventKey, route, tier)) return null;
  if (!(await withinDailyQuota(input.guildId, tier))) return null;

  const event = await prisma.logEvent.create({
    data: {
      guildId: input.guildId,
      eventKey: input.eventKey,
      actorId: input.actorId ?? null,
      targetId: input.targetId ?? null,
      channelId: input.channelId ?? null,
      summary: input.summary.slice(0, 2000),
      details: protectJson(boundDetails(input.details)),
      dispatchState: route?.enabled === false ? 'DISABLED' : 'PENDING'
    }
  });

  if (route?.enabled !== false) {
    try {
      await logQueue.add('dispatch', { eventId: event.id }, {
        jobId: event.id,
        removeOnComplete: 500,
        removeOnFail: 1000,
        attempts: DISPATCH_ATTEMPTS,
        backoff: { type: 'exponential', delay: 1500 }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.logEvent.update({ where: { id: event.id }, data: { dispatchState: 'QUEUE_ERROR', dispatchError: redactText(message).slice(0, 1000) } }).catch(() => null);
      logger.error({ eventId: event.id, error: redactText(message) }, 'Unable to enqueue Discord log');
    }
  }

  return event;
}
