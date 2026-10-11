import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '@sentinel/db';
import {
  BILLING_PERIODS,
  MULTI_SUBSCRIPTION_DISCOUNTS,
  EVENT_CATALOG,
  PLANS,
  PLAN_TIERS,
  normalizeCouponCode,
  requiredTierForEvent
} from '@sentinel/shared';
import { requireGuild, requireSession, requireSuperAdmin } from './auth.js';
import { panelAudit } from './audit.js';
import { superAdminAudit } from './super-audit.js';
import { getGuildResources, refreshStatusChannel, sendStatusTest, setBotBranding, type BotApiError } from './discord.js';
import { findForeignReference } from './helpers.js';
import { PlanError, changeGuildPlan, guildPlanUsage, guildTier } from './plan-service.js';

const snowflake = z.string().regex(/^\d{17,20}$/);
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional()
  .transform((value) => (value ? value : null));

export async function instanceConfig() {
  return prisma.instanceConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

const publicPlans = () => PLAN_TIERS.map((tier) => PLANS[tier]);

const eventTiers = () => ({
  TIER1: EVENT_CATALOG.filter((event) => requiredTierForEvent(event) === 'TIER1').map((event) => event.key),
  TIER2: EVENT_CATALOG.filter((event) => requiredTierForEvent(event) === 'TIER2').map((event) => event.key)
});

const couponIsLive = (coupon: { active: boolean; validFrom: Date | null; validUntil: Date | null; maxRedemptions: number | null; redemptions: number }, now = new Date()) =>
  coupon.active &&
  (!coupon.validFrom || coupon.validFrom <= now) &&
  (!coupon.validUntil || coupon.validUntil >= now) &&
  (coupon.maxRedemptions === null || coupon.redemptions < coupon.maxRedemptions);

const sendPlanError = (reply: FastifyReply, error: unknown) => {
  if (error instanceof PlanError) return reply.code(error.status).send({ error: error.code });
  throw error;
};

/**
 * Public plan catalogue, coupons, plan management, public contacts and the
 * instance status channel.
 */
export async function registerPlanRoutes(app: FastifyInstance) {
  // ---------------------------------------------------------------- public
  // Served to the pricing page (also server-side, from a single address), so
  // it is cached briefly instead of being rate limited per client.
  let publicInfoCache: { value: unknown; expires: number } | null = null;
  app.get('/api/public/info', { config: { rateLimit: false } }, async () => {
    if (publicInfoCache && publicInfoCache.expires > Date.now()) return publicInfoCache.value;
    const value = await loadPublicInfo();
    publicInfoCache = { value, expires: Date.now() + 30_000 };
    return value;
  });

  const loadPublicInfo = async () => {
    const [config, coupons] = await Promise.all([
      instanceConfig(),
      prisma.coupon.findMany({ where: { public: true, active: true }, orderBy: { createdAt: 'desc' }, take: 10 })
    ]);
    return {
      contacts: { email: config.contactEmail, discord: config.contactDiscord, url: config.contactUrl },
      plans: publicPlans(),
      multiSubscriptionDiscounts: MULTI_SUBSCRIPTION_DISCOUNTS,
      eventTiers: eventTiers(),
      promotions: coupons.filter((coupon) => couponIsLive(coupon)).map((coupon) => ({
        code: coupon.code,
        description: coupon.description,
        percentOff: coupon.percentOff,
        amountOffCents: coupon.amountOffCents,
        tiers: coupon.tiers,
        billing: coupon.billing,
        validUntil: coupon.validUntil
      }))
    };
  };

  // ------------------------------------------------------- super: settings
  app.put('/api/super/config', async (request, reply) => {
    const session = await requireSuperAdmin(request, reply);
    if (!session) return;
    const parsed = z.object({
      contactEmail: z.union([z.literal(''), z.string().trim().email().max(200)]).nullable().optional(),
      contactDiscord: z.string().trim().max(200).nullable().optional(),
      contactUrl: z.union([z.literal(''), z.string().trim().url().max(500).refine((value) => value.startsWith('https://'))]).nullable().optional()
    }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_BODY' });
    const text = (value: string | null | undefined) => value === undefined ? undefined : value || null;
    const data = {
      contactEmail: text(parsed.data.contactEmail),
      contactDiscord: text(parsed.data.contactDiscord),
      contactUrl: text(parsed.data.contactUrl)
    };
    const config = await prisma.instanceConfig.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
    await superAdminAudit(request, session, 'instance.config', null, null, data);
    return config;
  });

  // -------------------------------------------------------- super: coupons
  const couponBody = z.object({
    description: nullableText(200),
    percentOff: z.number().int().min(1).max(100).nullable().optional(),
    amountOffCents: z.number().int().min(1).max(100_000).nullable().optional(),
    tiers: z.array(z.enum(['TIER1', 'TIER2', 'TIER3'])).max(3).optional(),
    billing: z.enum(['ANY', 'MONTHLY', 'YEARLY']).optional(),
    maxRedemptions: z.number().int().min(1).max(100_000).nullable().optional(),
    validFrom: z.coerce.date().nullable().optional(),
    validUntil: z.coerce.date().nullable().optional(),
    active: z.boolean().optional(),
    public: z.boolean().optional()
  });
  const discountValid = (value: { percentOff?: number | null; amountOffCents?: number | null }) =>
    Boolean(value.percentOff) !== Boolean(value.amountOffCents);

  app.post('/api/super/coupons', async (request, reply) => {
    const session = await requireSuperAdmin(request, reply);
    if (!session) return;
    const parsed = couponBody.extend({ code: z.string().trim().regex(/^[A-Za-z0-9_-]{3,32}$/) }).safeParse(request.body);
    if (!parsed.success || !discountValid(parsed.data)) return reply.code(400).send({ error: 'INVALID_COUPON' });
    const code = normalizeCouponCode(parsed.data.code);
    if (await prisma.coupon.findUnique({ where: { code }, select: { id: true } })) return reply.code(409).send({ error: 'COUPON_EXISTS' });
    const coupon = await prisma.coupon.create({ data: { ...parsed.data, code, createdByUserId: session.userId } });
    await superAdminAudit(request, session, 'coupon.create', 'COUPON', code, { percentOff: coupon.percentOff, amountOffCents: coupon.amountOffCents });
    return coupon;
  });

  app.put('/api/super/coupons/:id', async (request, reply) => {
    const session = await requireSuperAdmin(request, reply);
    if (!session) return;
    const { id } = request.params as { id: string };
    const parsed = couponBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_COUPON' });
    const current = await prisma.coupon.findUnique({ where: { id } });
    if (!current) return reply.code(404).send({ error: 'NOT_FOUND' });
    const next = { percentOff: current.percentOff, amountOffCents: current.amountOffCents, ...parsed.data };
    if (!discountValid(next)) return reply.code(400).send({ error: 'INVALID_COUPON' });
    const coupon = await prisma.coupon.update({ where: { id }, data: parsed.data });
    await superAdminAudit(request, session, 'coupon.update', 'COUPON', coupon.code, parsed.data);
    return coupon;
  });

  app.delete('/api/super/coupons/:id', async (request, reply) => {
    const session = await requireSuperAdmin(request, reply);
    if (!session) return;
    const { id } = request.params as { id: string };
    const coupon = await prisma.coupon.findUnique({ where: { id } });
    if (!coupon) return reply.code(404).send({ error: 'NOT_FOUND' });
    await prisma.coupon.delete({ where: { id } });
    await superAdminAudit(request, session, 'coupon.delete', 'COUPON', coupon.code);
    return { ok: true };
  });

  // ---------------------------------------------------------- super: plans
  app.put('/api/super/guilds/:guildId/plan', async (request, reply) => {
    const session = await requireSuperAdmin(request, reply);
    if (!session) return;
    const { guildId } = request.params as { guildId: string };
    const parsed = z.object({
      tier: z.enum(PLAN_TIERS),
      billing: z.enum(BILLING_PERIODS).nullable().optional(),
      expiresAt: z.coerce.date().nullable().optional(),
      couponCode: z.string().trim().max(32).nullable().optional(),
      note: nullableText(500)
    }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_BODY' });
    const change = {
      tier: parsed.data.tier,
      billing: parsed.data.billing ?? null,
      expiresAt: parsed.data.expiresAt ?? null,
      couponCode: parsed.data.couponCode || null,
      note: parsed.data.note
    };
    if (change.tier !== 'FREE' && change.expiresAt && change.expiresAt.getTime() <= Date.now()) {
      return reply.code(400).send({ error: 'EXPIRY_IN_PAST' });
    }
    try {
      const result = await changeGuildPlan(guildId, change, request.log);
      await superAdminAudit(request, session, 'plan.update', 'GUILD', guildId, { ...change, ...result });
      return { ok: true, ...result };
    } catch (error) {
      return sendPlanError(reply, error);
    }
  });

  // ------------------------------------------------- super: status channel
  app.get('/api/super/status-channel/channels', async (request, reply) => {
    const session = await requireSuperAdmin(request, reply);
    if (!session) return;
    const parsed = z.object({ guildId: snowflake }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_QUERY' });
    try {
      const resources = await getGuildResources(parsed.data.guildId);
      return resources.channels.filter((channel) => [0, 5].includes(channel.type)).map((channel) => ({ id: channel.id, name: channel.name, type: channel.type }));
    } catch (error) {
      request.log.warn({ err: error }, 'Unable to list status channel candidates');
      return reply.code(502).send({ error: 'DISCORD_RESOURCES_FAILED' });
    }
  });

  app.put('/api/super/status-channel', async (request, reply) => {
    const session = await requireSuperAdmin(request, reply);
    if (!session) return;
    const parsed = z.object({ guildId: snowflake, channelId: snowflake }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_BODY' });
    const { guildId, channelId } = parsed.data;
    try {
      const resources = await getGuildResources(guildId);
      if (findForeignReference(resources, { sendableChannelIds: [channelId] })) return reply.code(400).send({ error: 'UNKNOWN_GUILD_REFERENCE' });
    } catch (error) {
      request.log.warn({ err: error }, 'Unable to verify status channel');
      return reply.code(502).send({ error: 'DISCORD_RESOURCES_FAILED' });
    }
    const row = await prisma.statusChannel.upsert({
      where: { id: 1 },
      update: { guildId, channelId, updatedByUserId: session.userId },
      create: { id: 1, guildId, channelId, updatedByUserId: session.userId }
    });
    await refreshStatusChannel().catch(() => null);
    await superAdminAudit(request, session, 'status_channel.update', 'CHANNEL', channelId, { guildId });
    return row;
  });

  app.delete('/api/super/status-channel', async (request, reply) => {
    const session = await requireSuperAdmin(request, reply);
    if (!session) return;
    await prisma.statusChannel.deleteMany({ where: { id: 1 } });
    await refreshStatusChannel().catch(() => null);
    await superAdminAudit(request, session, 'status_channel.delete', null, null);
    return { ok: true };
  });

  app.post('/api/super/status-channel/test', async (request, reply) => {
    const session = await requireSuperAdmin(request, reply);
    if (!session) return;
    try {
      return await sendStatusTest();
    } catch (error) {
      request.log.warn({ err: error }, 'Status test failed');
      return reply.code(502).send({ error: 'BOT_UNAVAILABLE' });
    }
  });

  // --------------------------------------------------------- guild: plan
  app.get('/api/guilds/:guildId/plan', async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const session = await requireGuild(request, reply, guildId);
    if (!session) return;
    const usage = await guildPlanUsage(guildId);
    if (!usage) return reply.code(404).send({ error: 'BOT_NOT_IN_GUILD' });
    return { ...usage, eventTiers: eventTiers() };
  });

  // Banners are resized in the browser to stay under the edge proxy's 64 KB
  // body limit; the API accepts slightly more to allow for JSON overhead.
  app.put('/api/guilds/:guildId/branding', { bodyLimit: 96 * 1024 }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { guildId } = request.params as { guildId: string };
    const session = await requireGuild(request, reply, guildId, 'ADMIN');
    if (!session) return;
    const { plan } = await guildTier(guildId);
    if (!plan.customBranding) return reply.code(403).send({ error: 'PLAN_REQUIRED', required: 'TIER3' });

    const parsed = z.object({
      nickname: z.string().trim().min(1).max(32).nullable().optional(),
      banner: z.string().max(90_000).regex(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/).nullable().optional()
    }).refine((value) => value.nickname !== undefined || value.banner !== undefined).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_BODY' });

    const profile: { nick?: string | null; banner?: string | null } = {};
    if (parsed.data.nickname !== undefined) profile.nick = parsed.data.nickname;
    if (parsed.data.banner !== undefined) profile.banner = parsed.data.banner;
    try {
      await setBotBranding(guildId, profile);
    } catch (error) {
      const body = (error as BotApiError).body;
      request.log.warn({ err: error, discord: body }, 'Bot branding update failed');
      const status = typeof body?.status === 'number' ? body.status : null;
      return reply.code(502).send({ error: status === 403 ? 'BRANDING_MISSING_PERMISSION' : 'BRANDING_FAILED', discordStatus: status });
    }

    const data = {
      ...(parsed.data.nickname !== undefined ? { brandNickname: parsed.data.nickname } : {}),
      ...(parsed.data.banner !== undefined ? { brandBannerSet: parsed.data.banner !== null } : {})
    };
    const updated = await prisma.guildSettings.update({ where: { guildId }, data, select: { brandNickname: true, brandBannerSet: true } });
    await panelAudit(request, session, guildId, 'branding.update', {
      nickname: parsed.data.nickname,
      banner: parsed.data.banner === undefined ? undefined : parsed.data.banner === null ? 'removed' : 'updated'
    });
    return { ok: true, nickname: updated.brandNickname, bannerSet: updated.brandBannerSet };
  });
}

/** Super console overview additions: plans, coupons, settings. */
export async function planOverview(botGuildIds: string[]) {
  const [config, coupons, statusChannel, plans] = await Promise.all([
    instanceConfig(),
    prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.statusChannel.findUnique({ where: { id: 1 } }),
    prisma.guildSettings.findMany({
      where: { guildId: { in: botGuildIds } },
      select: { guildId: true, planTier: true, planBilling: true, planExpiresAt: true, planCouponCode: true, planNote: true, planUpdatedAt: true }
    })
  ]);
  return { config, statusChannel, coupons, plans, planCatalog: publicPlans(), multiSubscriptionDiscounts: MULTI_SUBSCRIPTION_DISCOUNTS };
}
