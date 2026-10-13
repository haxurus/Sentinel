import { prisma } from '@sentinel/db';
import { getEntitlements, type Entitlement } from './discord.js';
import { decidePlan, parseSkus, plansFromEntitlements, skuIndex } from './discord-plans.js';
import { applyPlanLimits, systemAudit } from './plan-service.js';

export { PAID_TIERS, SKU_PERIODS, parseSkus, storeLinks } from './discord-plans.js';

type Logger = { warn: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void };

export type SyncResult = { at: string; ok: boolean; entitlements: number; changed: number; error?: string };
let lastSync: SyncResult | null = null;
export const lastDiscordSync = () => lastSync;

export async function configuredSkus() {
  const config = await prisma.instanceConfig.findUnique({ where: { id: 1 }, select: { discordSkus: true } });
  return parseSkus(config?.discordSkus);
}

/**
 * Brings every server's plan in line with the Discord subscriptions. If the
 * entitlements cannot be read nothing changes: an outage never downgrades.
 */
export async function syncDiscordPlans(log: Logger): Promise<SyncResult> {
  const skus = await configuredSkus();
  if (!skuIndex(skus).size) {
    lastSync = { at: new Date().toISOString(), ok: true, entitlements: 0, changed: 0 };
    return lastSync;
  }

  let entitlements: Entitlement[];
  try {
    entitlements = await getEntitlements();
  } catch (error) {
    log.warn({ err: error }, 'Unable to read Discord entitlements');
    lastSync = { at: new Date().toISOString(), ok: false, entitlements: 0, changed: 0, error: 'ENTITLEMENTS_UNAVAILABLE' };
    return lastSync;
  }

  const now = new Date();
  const discordPlans = plansFromEntitlements(entitlements, skus, now);
  const rows = await prisma.guildSettings.findMany({
    where: { OR: [{ planSource: 'DISCORD' }, { guildId: { in: [...discordPlans.keys()] } }] },
    select: { guildId: true, planTier: true, planExpiresAt: true, planSource: true, planEntitlementId: true, planBilling: true }
  });

  let changed = 0;
  for (const row of rows) {
    const decision = decidePlan(row, discordPlans.get(row.guildId), now);
    if (decision.kind === 'keep') continue;
    try {
      if (decision.kind === 'discord') {
        const { plan } = decision;
        await prisma.guildSettings.update({
          where: { guildId: row.guildId },
          data: {
            planTier: plan.tier,
            planBilling: plan.billing,
            planExpiresAt: plan.expiresAt,
            planSource: 'DISCORD',
            planEntitlementId: plan.entitlementId,
            planCouponCode: null,
            planUpdatedAt: now,
            premiumEnabled: true
          }
        });
        const applied = decision.downgrade ? await applyPlanLimits(row.guildId, plan.tier, log) : null;
        if (row.planSource !== 'DISCORD' || row.planTier !== plan.tier || row.planEntitlementId !== plan.entitlementId) {
          await systemAudit('plan.discord_subscription', 'GUILD', row.guildId, {
            previousTier: row.planTier, tier: plan.tier, billing: plan.billing, entitlementId: plan.entitlementId, applied
          });
        }
      } else {
        await prisma.guildSettings.update({
          where: { guildId: row.guildId },
          data: { planTier: 'FREE', planBilling: null, planExpiresAt: null, planSource: 'MANUAL', planEntitlementId: null, planUpdatedAt: now, premiumEnabled: false }
        });
        const applied = await applyPlanLimits(row.guildId, 'FREE', log);
        await systemAudit('plan.discord_ended', 'GUILD', row.guildId, { previousTier: row.planTier, entitlementId: row.planEntitlementId, applied });
      }
      changed += 1;
    } catch (error) {
      log.error({ err: error, guildId: row.guildId }, 'Unable to sync Discord plan');
    }
  }

  lastSync = { at: now.toISOString(), ok: true, entitlements: entitlements.length, changed };
  return lastSync;
}
