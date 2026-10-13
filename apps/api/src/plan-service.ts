import { prisma } from '@sentinel/db';
import { PLANS, effectiveTier, planLimits, type PlanTier } from '@sentinel/shared';
import { setBotBranding } from './discord.js';
import { logChannelSet, planAdjustments } from './plan-rules.js';
import { protectJson } from './security.js';

type Logger = { warn: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void };

export async function guildTier(guildId: string) {
  const row = await prisma.guildSettings.findUnique({ where: { guildId }, select: { planTier: true, planExpiresAt: true } });
  const tier: PlanTier = row ? effectiveTier(row) : 'FREE';
  return { tier, limits: planLimits(tier), plan: PLANS[tier] };
}

export class PlanError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
  }
}

/**
 * Brings a server's configuration within a plan: used after a downgrade, an
 * expiry or a manual change from the super console.
 */
export async function applyPlanLimits(guildId: string, tier: PlanTier, log: Logger) {
  const [settings, routes, bindings] = await Promise.all([
    prisma.guildSettings.findUnique({ where: { guildId } }),
    prisma.logRoute.findMany({ where: { guildId } }),
    prisma.panelRoleBinding.findMany({ where: { guildId }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  ]);
  if (!settings) return { routes: 0, settings: 0, bindingsRemoved: 0 };

  const adjustments = planAdjustments(tier, settings, routes);
  const limits = planLimits(tier);
  const extraBindings = bindings.slice(limits.roleBindings).map((binding) => binding.id);

  await prisma.$transaction([
    ...(Object.keys(adjustments.settings).length ? [prisma.guildSettings.update({ where: { guildId }, data: adjustments.settings })] : []),
    ...adjustments.routes.map(({ eventKey, data }) => prisma.logRoute.update({ where: { guildId_eventKey: { guildId, eventKey } }, data })),
    ...(extraBindings.length ? [prisma.panelRoleBinding.deleteMany({ where: { id: { in: extraBindings } } })] : [])
  ]);

  if (!PLANS[tier].customBranding && (settings.brandNickname || settings.brandBannerSet)) {
    try {
      await setBotBranding(guildId, { nick: null, banner: null });
    } catch (error) {
      log.warn({ err: error, guildId }, 'Unable to reset bot branding after downgrade');
    }
    await prisma.guildSettings.update({ where: { guildId }, data: { brandNickname: null, brandBannerSet: false } });
  }

  return { routes: adjustments.routes.length, settings: Object.keys(adjustments.settings).length, bindingsRemoved: extraBindings.length };
}

/**
 * A plan set by hand from the super console. Paid plans are sold only through
 * Discord, so a manual plan is always free of charge: a trial, a partner plan
 * or a gift.
 */
export type PlanChange = {
  tier: PlanTier;
  expiresAt: Date | null;
  note: string | null;
};

export async function changeGuildPlan(guildId: string, change: PlanChange, log: Logger) {
  const current = await prisma.guildSettings.findUnique({ where: { guildId }, select: { planTier: true } });
  if (!current) throw new PlanError('GUILD_NOT_FOUND', 404);

  const free = change.tier === 'FREE';
  await prisma.guildSettings.update({
    where: { guildId },
    data: {
      planTier: change.tier,
      planBilling: free ? null : 'GIFT',
      planExpiresAt: free ? null : change.expiresAt,
      planSource: 'MANUAL',
      planEntitlementId: null,
      planCouponCode: null,
      planNote: change.note,
      planUpdatedAt: new Date(),
      // Kept in sync so the previous release still behaves after a rollback.
      premiumEnabled: !free
    }
  });

  const tier = effectiveTier({ planTier: change.tier, planExpiresAt: free ? null : change.expiresAt });
  const applied = await applyPlanLimits(guildId, tier, log);
  return { previousTier: current.planTier, tier: change.tier, effectiveTier: tier, applied };
}

export async function systemAudit(action: string, subjectType: string | null, subjectId: string | null, details: Record<string, unknown> = {}) {
  await prisma.superAdminAudit.create({
    data: {
      userId: 'system',
      username: 'Sentinel',
      action,
      subjectType,
      subjectId,
      details: protectJson(JSON.parse(JSON.stringify(details)))
    }
  });
}

/** Expired plans fall back to Free and their configuration is trimmed. */
export async function sweepExpiredPlans(log: Logger) {
  const expired = await prisma.guildSettings.findMany({
    where: { planTier: { not: 'FREE' }, planExpiresAt: { lte: new Date() } },
    select: { guildId: true, planTier: true, planExpiresAt: true }
  });
  for (const row of expired) {
    try {
      await prisma.guildSettings.update({
        where: { guildId: row.guildId },
        data: { planTier: 'FREE', planBilling: null, planCouponCode: null, planSource: 'MANUAL', planEntitlementId: null, premiumEnabled: false, planUpdatedAt: new Date() }
      });
      const applied = await applyPlanLimits(row.guildId, 'FREE', log);
      await systemAudit('plan.expired', 'GUILD', row.guildId, { previousTier: row.planTier, expiredAt: row.planExpiresAt, applied });
    } catch (error) {
      log.error({ err: error, guildId: row.guildId }, 'Unable to expire plan');
    }
  }
  return expired.length;
}

export async function guildPlanUsage(guildId: string) {
  const settings = await prisma.guildSettings.findUnique({
    where: { guildId },
    select: {
      planTier: true, planExpiresAt: true, planBilling: true, planSource: true, defaultLogChannelId: true,
      brandNickname: true, brandBannerSet: true
    }
  });
  if (!settings) return null;
  const tier = effectiveTier(settings);
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [eventsToday, routes, roleBindings] = await Promise.all([
    prisma.logEvent.count({ where: { guildId, createdAt: { gte: startOfDay } } }),
    prisma.logRoute.findMany({ where: { guildId }, select: { destinationChannelId: true } }),
    prisma.panelRoleBinding.count({ where: { guildId } })
  ]);
  return {
    tier: settings.planTier,
    effectiveTier: tier,
    expiresAt: settings.planExpiresAt,
    billing: settings.planBilling,
    source: settings.planSource,
    plan: PLANS[tier],
    usage: {
      eventsToday,
      logChannels: logChannelSet(settings.defaultLogChannelId, routes).size,
      roleBindings
    },
    branding: { nickname: settings.brandNickname, bannerSet: settings.brandBannerSet }
  };
}
