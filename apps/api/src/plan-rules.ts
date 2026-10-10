import { EVENT_CATALOG, SETTINGS_TIER, planLimits, requiredTierForEvent, tierAllows, type PlanTier } from '@sentinel/shared';

export type PlanRoute = {
  eventKey: string;
  captureEnabled: boolean;
  enabled: boolean;
  destinationChannelId: string | null;
  retentionDays: number | null;
  ignoredUserIds: string[];
  ignoredRoleIds: string[];
  ignoredChannelIds: string[];
  mentionRoleIds: string[];
};

export type PlanSettings = {
  defaultLogChannelId: string | null;
  defaultRetentionDays: number;
  presenceLoggingEnabled: boolean;
  typingLoggingEnabled: boolean;
  rawGatewayEnabled: boolean;
};

const eventByKey = new Map(EVENT_CATALOG.map((event) => [event.key, event]));

export const requiredTierForKey = (eventKey: string) => requiredTierForEvent(eventByKey.get(eventKey));

/** Distinct Discord channels that receive logs, default channel included. */
export function logChannelSet(defaultChannelId: string | null, routes: Array<{ destinationChannelId: string | null }>) {
  const channels = new Set<string>();
  if (defaultChannelId) channels.add(defaultChannelId);
  for (const route of routes) if (route.destinationChannelId) channels.add(route.destinationChannelId);
  return channels;
}

export const filterEntryCount = (route: Pick<PlanRoute, 'ignoredUserIds' | 'ignoredRoleIds' | 'ignoredChannelIds'>) =>
  route.ignoredUserIds.length + route.ignoredRoleIds.length + route.ignoredChannelIds.length;

/** Keeps the first `max` filter entries, in user → role → channel order. */
export function trimFilters(route: Pick<PlanRoute, 'ignoredUserIds' | 'ignoredRoleIds' | 'ignoredChannelIds'>, max: number) {
  let budget = max;
  const take = (values: string[]) => {
    const kept = values.slice(0, Math.max(0, budget));
    budget -= kept.length;
    return kept;
  };
  return { ignoredUserIds: take(route.ignoredUserIds), ignoredRoleIds: take(route.ignoredRoleIds), ignoredChannelIds: take(route.ignoredChannelIds) };
}

export type PlanAdjustments = {
  settings: Partial<PlanSettings>;
  routes: Array<{ eventKey: string; data: Partial<PlanRoute> }>;
};

/**
 * What must change for an existing configuration to fit a plan, e.g. after a
 * downgrade or an expiry. Nothing is deleted: loggers above the plan are
 * switched off, values above a limit are clamped, extra channels fall back to
 * the default channel and extra filters are dropped from the end.
 */
export function planAdjustments(tier: PlanTier, settings: PlanSettings, routes: PlanRoute[]): PlanAdjustments {
  const limits = planLimits(tier);
  const settingsPatch: Partial<PlanSettings> = {};
  if (settings.defaultRetentionDays > limits.retentionDays) settingsPatch.defaultRetentionDays = limits.retentionDays;
  for (const [key, required] of Object.entries(SETTINGS_TIER) as Array<[keyof typeof SETTINGS_TIER, PlanTier]>) {
    if (settings[key] && !tierAllows(tier, required)) settingsPatch[key] = false;
  }

  const allowedChannels = new Set<string>();
  if (settings.defaultLogChannelId) allowedChannels.add(settings.defaultLogChannelId);

  const routePatches: PlanAdjustments['routes'] = [];
  for (const route of [...routes].sort((a, b) => a.eventKey.localeCompare(b.eventKey))) {
    const data: Partial<PlanRoute> = {};
    if ((route.captureEnabled || route.enabled) && !tierAllows(tier, requiredTierForKey(route.eventKey))) {
      data.captureEnabled = false;
      data.enabled = false;
    }
    if (route.destinationChannelId && !allowedChannels.has(route.destinationChannelId)) {
      if (allowedChannels.size < limits.logChannels) allowedChannels.add(route.destinationChannelId);
      else data.destinationChannelId = null;
    }
    if (route.retentionDays !== null && route.retentionDays > limits.retentionDays) data.retentionDays = limits.retentionDays;
    if (filterEntryCount(route) > limits.filterEntries) Object.assign(data, trimFilters(route, limits.filterEntries));
    if (route.mentionRoleIds.length > limits.mentionRoles) data.mentionRoleIds = route.mentionRoleIds.slice(0, limits.mentionRoles);
    if (Object.keys(data).length) routePatches.push({ eventKey: route.eventKey, data });
  }

  return { settings: settingsPatch, routes: routePatches };
}

/** Discord permission bits that let a user add bots to a server. */
const ADMINISTRATOR = 0x8n;
const MANAGE_GUILD = 0x20n;

export function canManageGuild(guild: { owner: boolean; permissions: string }) {
  if (guild.owner) return true;
  try {
    const permissions = BigInt(guild.permissions);
    return (permissions & ADMINISTRATOR) === ADMINISTRATOR || (permissions & MANAGE_GUILD) === MANAGE_GUILD;
  } catch {
    return false;
  }
}

/** Fields only the instance owner should see (billing notes, coupon used). */
export function publicGuildSettings<T extends { planNote?: unknown; planCouponCode?: unknown }>(settings: T) {
  const { planNote: _note, planCouponCode: _coupon, ...rest } = settings;
  return rest;
}
