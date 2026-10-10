/**
 * Subscription plans. Single source of truth for the bot (capture, quotas,
 * retention), the API (validation, downgrades) and, through the public API,
 * the pricing page and dashboards.
 */

export const PLAN_TIERS = ['FREE', 'TIER1', 'TIER2', 'TIER3'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const BILLING_PERIODS = ['MONTHLY', 'YEARLY', 'GIFT'] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export type PlanLimits = {
  /** Maximum retention, both server-wide and per logger. */
  retentionDays: number;
  /** Events stored per server per UTC day; further events are dropped. */
  eventsPerDay: number;
  /** Distinct Discord channels receiving logs (default channel included). */
  logChannels: number;
  /** Ignored users + roles + channels, per logger. */
  filterEntries: number;
  /** Roles mentioned by a single logger. */
  mentionRoles: number;
  /** Discord roles mapped to dashboard access levels. */
  roleBindings: number;
  /** Events included in a single JSON export. */
  exportEvents: number;
};

export type PlanDefinition = {
  tier: PlanTier;
  name: string;
  level: number;
  monthlyCents: number;
  yearlyCents: number;
  limits: PlanLimits;
  prioritySupport: boolean;
  customBranding: boolean;
};

const PAID_LIMITS: PlanLimits = {
  retentionDays: 365,
  eventsPerDay: 50_000,
  logChannels: 20,
  filterEntries: 100,
  mentionRoles: 5,
  roleBindings: 10,
  exportEvents: 50_000
};

export const PLANS: Record<PlanTier, PlanDefinition> = {
  FREE: {
    tier: 'FREE', name: 'Free', level: 0, monthlyCents: 0, yearlyCents: 0,
    limits: { retentionDays: 30, eventsPerDay: 2_000, logChannels: 3, filterEntries: 15, mentionRoles: 1, roleBindings: 1, exportEvents: 1_000 },
    prioritySupport: false, customBranding: false
  },
  TIER1: {
    tier: 'TIER1', name: 'Plus', level: 1, monthlyCents: 200, yearlyCents: 2_000,
    limits: { retentionDays: 90, eventsPerDay: 10_000, logChannels: 8, filterEntries: 40, mentionRoles: 2, roleBindings: 3, exportEvents: 10_000 },
    prioritySupport: true, customBranding: false
  },
  TIER2: {
    tier: 'TIER2', name: 'Pro', level: 2, monthlyCents: 500, yearlyCents: 5_000,
    limits: PAID_LIMITS,
    prioritySupport: true, customBranding: false
  },
  TIER3: {
    tier: 'TIER3', name: 'Brand', level: 3, monthlyCents: 1_000, yearlyCents: 9_000,
    limits: PAID_LIMITS,
    prioritySupport: true, customBranding: true
  }
};

/** High-volume loggers that need Pro (level 2): debugging and presence data. */
const TIER2_EVENTS = new Set([
  'presence.update',
  'typing.start',
  'raw.gateway',
  'voice.server_update',
  'thread.list_sync',
  'soundboard.sync',
  'guild.available'
]);

export const isPlanTier = (value: unknown): value is PlanTier =>
  typeof value === 'string' && (PLAN_TIERS as readonly string[]).includes(value);

export const tierLevel = (tier: PlanTier) => PLANS[tier].level;

export const tierAllows = (tier: PlanTier, required: PlanTier) => tierLevel(tier) >= tierLevel(required);

/**
 * Minimum plan for a logger. Standard events are free; high-volume ("noisy")
 * events need Plus, the heaviest ones Pro.
 */
export function requiredTierForEvent(event: { key: string; noisy?: boolean } | undefined): PlanTier {
  if (!event) return 'FREE';
  if (TIER2_EVENTS.has(event.key)) return 'TIER2';
  return event.noisy ? 'TIER1' : 'FREE';
}

/** Settings toggles that turn on high-volume Gateway capture. */
export const SETTINGS_TIER = {
  presenceLoggingEnabled: 'TIER2',
  typingLoggingEnabled: 'TIER2',
  rawGatewayEnabled: 'TIER2'
} as const satisfies Record<string, PlanTier>;

/** The plan in force: an expired plan behaves as Free until it is renewed. */
export function effectiveTier(
  plan: { planTier?: string | null; planExpiresAt?: Date | string | null },
  now: Date = new Date()
): PlanTier {
  const tier = isPlanTier(plan.planTier) ? plan.planTier : 'FREE';
  if (tier === 'FREE' || !plan.planExpiresAt) return tier;
  const expires = new Date(plan.planExpiresAt);
  return Number.isNaN(expires.getTime()) || expires.getTime() > now.getTime() ? tier : 'FREE';
}

export const planLimits = (tier: PlanTier) => PLANS[tier].limits;

export type CouponLike = {
  code: string;
  percentOff: number | null;
  amountOffCents: number | null;
  tiers: string[];
  billing: string;
  maxRedemptions: number | null;
  redemptions: number;
  validFrom: Date | string | null;
  validUntil: Date | string | null;
  active: boolean;
};

export const normalizeCouponCode = (value: string) => value.trim().toUpperCase();

/** Why a coupon cannot be applied to a plan, or null when it can. */
export function couponProblem(coupon: CouponLike, tier: PlanTier, billing: BillingPeriod | null, now: Date = new Date()) {
  if (!coupon.active) return 'COUPON_INACTIVE';
  if (coupon.validFrom && new Date(coupon.validFrom).getTime() > now.getTime()) return 'COUPON_NOT_STARTED';
  if (coupon.validUntil && new Date(coupon.validUntil).getTime() < now.getTime()) return 'COUPON_EXPIRED';
  if (coupon.maxRedemptions !== null && coupon.redemptions >= coupon.maxRedemptions) return 'COUPON_EXHAUSTED';
  if (tier === 'FREE') return 'COUPON_FREE_PLAN';
  if (coupon.tiers.length && !coupon.tiers.includes(tier)) return 'COUPON_WRONG_TIER';
  if (coupon.billing !== 'ANY' && coupon.billing !== billing) return 'COUPON_WRONG_BILLING';
  return null;
}

export function basePriceCents(tier: PlanTier, billing: BillingPeriod | null) {
  if (billing === 'YEARLY') return PLANS[tier].yearlyCents;
  if (billing === 'MONTHLY') return PLANS[tier].monthlyCents;
  return 0;
}

/** Price after a coupon, never below zero. */
export function discountedPriceCents(priceCents: number, coupon: Pick<CouponLike, 'percentOff' | 'amountOffCents'> | null) {
  if (!coupon) return priceCents;
  let price = priceCents;
  if (coupon.percentOff) price = Math.round(price * (100 - coupon.percentOff) / 100);
  if (coupon.amountOffCents) price -= coupon.amountOffCents;
  return Math.max(0, price);
}
