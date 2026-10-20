import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '@sentinel/db';
import { EVENT_CATALOG, PLANS, PLAN_TIERS, requiredTierForEvent } from '@sentinel/shared';
import { requireGuild, requireSession, requireSuperAdmin } from './auth.js';
import { panelAudit } from './audit.js';
import { superAdminAudit } from './super-audit.js';
import { getGuildResources, refreshStatusChannel, sendStatusTest, setBotBranding, type BotApiError } from './discord.js';
import { findForeignReference } from './helpers.js';
import { PlanError, changeGuildPlan, guildPlanUsage, guildTier } from './plan-service.js';
import { config as appConfig } from './config.js';
import { PAID_TIERS, SKU_PERIODS, lastDiscordSync, parseSkus, storeLinks, syncDiscordPlans } from './discord-billing.js';

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

/** Where each paid plan can be bought in Discord (null until configured). */
const discordStore = (skus: unknown) => storeLinks(parseSkus(skus), appConfig.clientId);

const sendPlanError = (reply: FastifyReply, error: unknown) => {
  if (error instanceof PlanError) return reply.code(error.status).send({ error: error.code });
  throw error;
};

/**
 * Public plan catalogue, Discord subscriptions, plan management, public
 * contacts and the instance status channel.
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
    const config = await instanceConfig();
    return {
      contacts: { email: config.contactEmail, discord: config.contactDiscord, url: config.contactUrl },
      plans: publicPlans(),
      eventTiers: eventTiers(),
      discord: discordStore(config.discordSkus)
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
    const { alertWebhookUrl: _webhook, ...visible } = config;
    return visible;
  });

  // ------------------------------------------ super: Discord subscriptions
  app.put('/api/super/discord-skus', async (request, reply) => {
    const session = await requireSuperAdmin(request, reply);
    if (!session) return;
    const sku = z.union([z.literal(''), snowflake]).nullable().optional();
    const period = z.object({ MONTHLY: sku, YEARLY: sku }).partial();
    const parsed = z.object({ TIER1: period, TIER2: period, TIER3: period }).partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_SKU' });
    const skus: Record<string, Record<string, string>> = {};
    const seen = new Set<string>();
    for (const tier of PAID_TIERS) {
      for (const billing of SKU_PERIODS) {
        const id = parsed.data[tier]?.[billing];
        if (!id) continue;
        if (seen.has(id)) return reply.code(400).send({ error: 'DUPLICATE_SKU' });
        seen.add(id);
        skus[tier] = { ...skus[tier], [billing]: id };
      }
    }
    await prisma.instanceConfig.upsert({ where: { id: 1 }, update: { discordSkus: skus }, create: { id: 1, discordSkus: skus } });
    publicInfoCache = null;
    await superAdminAudit(request, session, 'discord.skus', null, null, skus);
    return { skus, sync: await syncDiscordPlans(request.log) };
  });

  app.post('/api/super/discord-sync', async (request, reply) => {
    const session = await requireSuperAdmin(request, reply);
    if (!session) return;
    const result = await syncDiscordPlans(request.log);
    await superAdminAudit(request, session, 'discord.sync', null, null, result);
    if (!result.ok) return reply.code(502).send({ error: 'DISCORD_SYNC_FAILED' });
    return result;
  });

  // ---------------------------------------------------------- super: plans
  app.put('/api/super/guilds/:guildId/plan', async (request, reply) => {
    const session = await requireSuperAdmin(request, reply);
    if (!session) return;
    const { guildId } = request.params as { guildId: string };
    const parsed = z.object({
      tier: z.enum(PLAN_TIERS),
      expiresAt: z.coerce.date().nullable().optional(),
      note: nullableText(500)
    }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_BODY' });
    const change = {
      tier: parsed.data.tier,
      expiresAt: parsed.data.expiresAt ?? null,
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
    const [usage, config] = await Promise.all([guildPlanUsage(guildId), instanceConfig()]);
    if (!usage) return reply.code(404).send({ error: 'BOT_NOT_IN_GUILD' });
    return { ...usage, eventTiers: eventTiers(), discord: discordStore(config.discordSkus) };
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

/** Super console overview additions: plans, Discord subscriptions, settings. */
export async function planOverview(botGuildIds: string[]) {
  const [config, statusChannel, plans] = await Promise.all([
    instanceConfig(),
    prisma.statusChannel.findUnique({ where: { id: 1 } }),
    prisma.guildSettings.findMany({
      where: { guildId: { in: botGuildIds } },
      select: { guildId: true, planTier: true, planBilling: true, planExpiresAt: true, planSource: true, planNote: true, planUpdatedAt: true }
    })
  ]);
  const { discordSkus, alertWebhookUrl: _webhook, ...settings } = config;
  return {
    config: settings,
    statusChannel,
    plans,
    planCatalog: publicPlans(),
    discord: { skus: parseSkus(discordSkus), applicationId: appConfig.clientId, lastSync: lastDiscordSync(), ...discordStore(discordSkus) }
  };
}
