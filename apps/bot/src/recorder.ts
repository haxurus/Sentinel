import { prisma } from '@sentinel/db';
import { eventDefinition } from '@sentinel/shared';
import { logQueue } from './queue.js';
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

type RouteState = { captureEnabled: boolean; enabled: boolean; premiumEnabled: boolean } | null;

// Dashboard changes become effective within this window. It keeps the hot path
// (every Gateway event) from issuing one database query per event.
const ROUTE_CACHE_MS = 10_000;
const routeCache = new Map<string, { value: RouteState; expires: number }>();

async function getRouteState(guildId: string, eventKey: string): Promise<RouteState> {
  const key = `${guildId}:${eventKey}`;
  const cached = routeCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  const route = await prisma.logRoute.findUnique({
    where: { guildId_eventKey: { guildId, eventKey } },
    select: { captureEnabled: true, enabled: true, guild: { select: { premiumEnabled: true } } }
  });
  const value: RouteState = route
    ? { captureEnabled: route.captureEnabled, enabled: route.enabled, premiumEnabled: route.guild.premiumEnabled }
    : null;
  routeCache.set(key, { value, expires: Date.now() + ROUTE_CACHE_MS });
  return value;
}

export function invalidateRouteCache(guildId?: string) {
  if (!guildId) {
    routeCache.clear();
    return;
  }
  for (const key of routeCache.keys()) {
    if (key.startsWith(`${guildId}:`)) routeCache.delete(key);
  }
}

const captureAllowed = (eventKey: string, route: RouteState) => {
  if (eventDefinition(eventKey)?.noisy && !route?.premiumEnabled) return false;
  if (route && !route.captureEnabled) return false;
  return true;
};

/**
 * Cheap pre-check used by handlers before expensive work such as Audit Log
 * lookups. On database errors it answers true so recordEvent stays the single
 * place that decides.
 */
export async function shouldCapture(guildId: string, eventKey: string) {
  try {
    return captureAllowed(eventKey, await getRouteState(guildId, eventKey));
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
  if (!captureAllowed(input.eventKey, route)) return null;

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
