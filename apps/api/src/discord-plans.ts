import { effectiveTier, tierLevel } from '@sentinel/shared';
import type { Entitlement } from './discord.js';

/**
 * Paid plans are sold only as Discord Premium Apps guild subscriptions. Each
 * plan and billing period maps to a SKU configured in the super console; the
 * API reads the application's entitlements through the bot and keeps every
 * server's plan in line with them.
 */

export const PAID_TIERS = ['TIER1', 'TIER2', 'TIER3'] as const;
export const SKU_PERIODS = ['MONTHLY', 'YEARLY'] as const;
export type PaidTier = (typeof PAID_TIERS)[number];
export type SkuPeriod = (typeof SKU_PERIODS)[number];
export type DiscordSkus = Partial<Record<PaidTier, Partial<Record<SkuPeriod, string>>>>;

/**
 * A subscription keeps the plan for a few days after the end of the paid
 * period, so a late renewal or a failed sync never switches loggers off. When
 * the entitlement disappears, sync downgrades the server straight away.
 */
export const RENEWAL_GRACE_MS = 3 * 86_400_000;

const SNOWFLAKE = /^\d{17,20}$/;

/** Reads the stored JSON defensively: unknown keys and bad IDs are ignored. */
export function parseSkus(value: unknown): DiscordSkus {
  const result: DiscordSkus = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const tier of PAID_TIERS) {
    const periods = (value as Record<string, unknown>)[tier];
    if (!periods || typeof periods !== 'object') continue;
    for (const period of SKU_PERIODS) {
      const id = (periods as Record<string, unknown>)[period];
      if (typeof id === 'string' && SNOWFLAKE.test(id)) result[tier] = { ...result[tier], [period]: id };
    }
  }
  return result;
}

export const skuIndex = (skus: DiscordSkus) => {
  const index = new Map<string, { tier: PaidTier; period: SkuPeriod }>();
  for (const tier of PAID_TIERS) {
    for (const period of SKU_PERIODS) {
      const id = skus[tier]?.[period];
      if (id) index.set(id, { tier, period });
    }
  }
  return index;
};

/** Store pages of the configured SKUs, where people subscribe in Discord. */
export function storeLinks(skus: DiscordSkus, applicationId: string) {
  const links = {} as Record<PaidTier, Record<SkuPeriod, string | null>>;
  for (const tier of PAID_TIERS) {
    links[tier] = { MONTHLY: null, YEARLY: null };
    for (const period of SKU_PERIODS) {
      const id = skus[tier]?.[period];
      if (id) links[tier][period] = `https://discord.com/application-directory/${applicationId}/store/${id}`;
    }
  }
  const enabled = PAID_TIERS.some((tier) => SKU_PERIODS.some((period) => links[tier][period]));
  return { enabled, store: `https://discord.com/application-directory/${applicationId}/store`, links };
}

export type DiscordPlan = { tier: PaidTier; billing: SkuPeriod; entitlementId: string; expiresAt: Date | null };

/**
 * The best active subscription of each server: the highest plan, and for the
 * same plan the one that lasts longer. Entitlements of unknown SKUs, user
 * subscriptions and ended ones are ignored.
 */
export function plansFromEntitlements(entitlements: Entitlement[], skus: DiscordSkus, now = new Date()) {
  const index = skuIndex(skus);
  const best = new Map<string, DiscordPlan>();
  for (const entitlement of entitlements) {
    const sku = index.get(entitlement.skuId);
    if (!sku || !entitlement.guildId) continue;
    const endsAt = entitlement.endsAt ? new Date(entitlement.endsAt) : null;
    if (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= now.getTime())) continue;
    const candidate: DiscordPlan = {
      tier: sku.tier,
      billing: sku.period,
      entitlementId: entitlement.id,
      expiresAt: endsAt ? new Date(endsAt.getTime() + RENEWAL_GRACE_MS) : null
    };
    const current = best.get(entitlement.guildId);
    const longer = (a: Date | null, b: Date | null) => a === null ? b !== null : b !== null && a.getTime() > b.getTime();
    if (!current || tierLevel(candidate.tier) > tierLevel(current.tier) ||
      (candidate.tier === current.tier && longer(candidate.expiresAt, current.expiresAt))) {
      best.set(entitlement.guildId, candidate);
    }
  }
  return best;
}

type StoredPlan = { planTier: string; planExpiresAt: Date | null; planSource: string; planEntitlementId: string | null; planBilling: string | null };

export type PlanDecision =
  | { kind: 'keep' }
  | { kind: 'discord'; plan: DiscordPlan; downgrade: boolean }
  | { kind: 'ended' };

/**
 * What sync does with one server. A Discord subscription replaces a manual
 * plan unless the manual one is higher and still running (a gift or trial
 * above what was bought); a Discord plan without an active subscription ends.
 */
export function decidePlan(stored: StoredPlan, discord: DiscordPlan | undefined, now = new Date()): PlanDecision {
  const current = effectiveTier(stored, now);
  if (discord) {
    if (stored.planSource !== 'DISCORD' && tierLevel(current) > tierLevel(discord.tier)) return { kind: 'keep' };
    const same = stored.planSource === 'DISCORD' &&
      stored.planTier === discord.tier &&
      stored.planBilling === discord.billing &&
      stored.planEntitlementId === discord.entitlementId &&
      (stored.planExpiresAt?.getTime() ?? null) === (discord.expiresAt?.getTime() ?? null);
    if (same) return { kind: 'keep' };
    return { kind: 'discord', plan: discord, downgrade: tierLevel(discord.tier) < tierLevel(current) };
  }
  if (stored.planSource === 'DISCORD') return { kind: 'ended' };
  return { kind: 'keep' };
}
