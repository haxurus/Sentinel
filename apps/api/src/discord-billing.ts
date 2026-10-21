import { prisma } from '@sentinel/db';
import { getEntitlements, type Entitlement } from './discord.js';
import { decidePlan, parseSkus, plansFromEntitlements, skuIndex } from './discord-plans.js';
import { applyPlanLimits, systemAudit } from './plan-service.js';
import { openIncident, recordAlert, resolveIncident } from './alerting.js';
import { PLANS } from '@sentinel/shared';

export { PAID_TIERS, SKU_PERIODS, parseSkus, storeLinks } from './discord-plans.js';

type Logger = { warn: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void };

export type SyncResult = { at: string; ok: boolean; entitlements: number; changed: number; error?: string };
let lastSync: SyncResult | null = null;
let consecutiveFailures = 0;
/** Failed syncs in a row (2 min apart) before an incident: about 6 minutes. */
const FAILURES_BEFORE_INCIDENT = 3;
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
    consecutiveFailures += 1;
    if (consecutiveFailures >= FAILURES_BEFORE_INCIDENT) {
      await openIncident('discord.sync', { category: 'billing', severity: 'warning', message: 'sync.stopped' }).catch(() => null);
    }
    return lastSync;
  }

  consecutiveFailures = 0;
  await resolveIncident('discord.sync', 'sync.restored').catch(() => null);
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
          await recordAlert({
            category: 'billing', severity: 'info', level: 'ok',
            key: row.planSource === 'DISCORD' && row.planTier !== plan.tier ? 'subscription.changed' : 'subscription.new',
            params: { plan: PLANS[plan.tier].name },
            fields: [{ key: 'server', value: `\`${row.guildId}\`` }]
          }).catch(() => null);
        }
      } else {
        await prisma.guildSettings.update({
          where: { guildId: row.guildId },
          data: { planTier: 'FREE', planBilling: null, planExpiresAt: null, planSource: 'MANUAL', planEntitlementId: null, planUpdatedAt: now, premiumEnabled: false }
        });
        const applied = await applyPlanLimits(row.guildId, 'FREE', log);
        await systemAudit('plan.discord_ended', 'GUILD', row.guildId, { previousTier: row.planTier, entitlementId: row.planEntitlementId, applied });
        await recordAlert({
          category: 'billing', severity: 'info',
          key: 'subscription.ended',
          fields: [{ key: 'server', value: `\`${row.guildId}\`` }]
        }).catch(() => null);
      }
      changed += 1;
    } catch (error) {
      log.error({ err: error, guildId: row.guildId }, 'Unable to sync Discord plan');
    }
  }

  lastSync = { at: now.toISOString(), ok: true, entitlements: entitlements.length, changed };
  return lastSync;
}
