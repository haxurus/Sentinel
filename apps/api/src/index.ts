import crypto from 'node:crypto';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { prisma } from '@sentinel/db';
import { EVENT_CATALOG } from '@sentinel/shared';
import { config } from './config.js';
import { createSession, destroySession, getSession, isSuperAdminUserId, randomToken, requireGuild, requireSession, requireSuperAdmin, resolveGuildAccess, type OAuthGuild } from './auth.js';
import { getBotGuilds, getGuildResources, leaveBotGuild } from './discord.js';
import { panelAudit } from './audit.js';
import { superAdminAudit } from './super-audit.js';
import { unprotectJson } from './security.js';
import { exportJsonChunks, findForeignReference, isValidTimeZone, rateLimitKey } from './helpers.js';
import { Readable } from 'node:stream';

const app = Fastify({
  trustProxy: 1,
  bodyLimit: 32 * 1024,
  requestTimeout: 15_000,
  connectionTimeout: 10_000,
  maxParamLength: 256,
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', 'client_secret', '*.client_secret', '*.token', '*.password', '*.secret'],
      censor: '[REDACTED]'
    }
  }
});
await app.register(cookie);
await app.register(helmet);
await app.register(rateLimit, { max: 120, timeWindow: '1 minute', keyGenerator: (request) => rateLimitKey(request) });

const allowedOrigin = new URL(config.webUrl).origin;
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
app.addHook('onRequest', async (request, reply) => {
  if (safeMethods.has(request.method)) return;
  const origin = request.headers.origin;
  if (!origin || origin !== allowedOrigin) {
    return reply.code(403).send({ error: 'CSRF_ORIGIN_REJECTED' });
  }
});
app.addHook('onSend', async (_request, reply, payload) => {
  reply.header('Cache-Control', 'no-store');
  reply.header('Pragma', 'no-cache');
  return payload;
});

const snowflake = z.string().regex(/^\d{17,20}$/);
const optionalSnowflake = snowflake.nullable().optional();
app.addHook('preValidation', async (request, reply) => {
  const params = request.params as Record<string, unknown> | undefined;
  if (!params) return;
  for (const key of ['guildId', 'roleId', 'userId']) {
    if (params[key] !== undefined && !snowflake.safeParse(params[key]).success) {
      return reply.code(400).send({ error: 'INVALID_DISCORD_ID', field: key });
    }
  }
});

app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, 'Request failed');
  if (reply.sent) return;
  const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
  return reply.code(status).send({ error: status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED' });
});

app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'NOT_FOUND' }));

void prisma.panelSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => null);
setInterval(() => {
  void prisma.panelSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => null);
}, 60 * 60 * 1000).unref();

const cleanupPanelAudit = async () => {
  const guilds = await prisma.guildSettings.findMany({ select: { guildId: true, defaultRetentionDays: true } });
  for (const guild of guilds) {
    const cutoff = new Date(Date.now() - guild.defaultRetentionDays * 86_400_000);
    await prisma.panelAudit.deleteMany({ where: { guildId: guild.guildId, createdAt: { lt: cutoff } } });
  }
};
void cleanupPanelAudit().catch(() => null);
setInterval(() => void cleanupPanelAudit().catch(() => null), 6 * 60 * 60 * 1000).unref();

app.get('/health/live', async () => ({ ok: true, service: 'api' }));
app.get('/health', async (_request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, service: 'api', database: 'ready' };
  } catch {
    return reply.code(503).send({ ok: false, service: 'api', database: 'unavailable' });
  }
});

const botInstallUrl = () => {
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('scope', 'bot applications.commands');
  url.searchParams.set('permissions', '85120');
  return url.toString();
};

const canInstallBot = async (userId: string) => {
  const blocked = await prisma.installBlock.findUnique({
    where: { kind_subjectId: { kind: 'USER', subjectId: userId } },
    select: { id: true }
  });
  return !blocked && config.inviteAllowedUserIds.includes(userId);
};

app.get('/bot/invite', async (request, reply) => {
  const parsed = z.object({ lang: z.enum(['it', 'en']).optional() }).safeParse(request.query);
  const uiLanguage = parsed.success ? (parsed.data.lang ?? 'it') : 'it';
  const session = await getSession(request);

  if (!session) {
    const loginUrl = new URL(`${config.publicBaseUrl}/auth/discord`);
    loginUrl.searchParams.set('lang', uiLanguage);
    loginUrl.searchParams.set('intent', 'invite');
    return reply.redirect(loginUrl.toString());
  }

  if (!(await canInstallBot(session.userId))) {
    return reply.redirect(`${config.webUrl}/${uiLanguage}/development`);
  }

  return reply.redirect(botInstallUrl());
});

app.get('/auth/discord', async (request, reply) => {
  const authQuery = z.object({
    lang: z.enum(['it', 'en']).optional(),
    intent: z.enum(['dashboard', 'invite']).optional()
  }).safeParse(request.query);
  const uiLanguage = authQuery.success ? (authQuery.data.lang ?? 'it') : 'it';
  const authIntent = authQuery.success ? (authQuery.data.intent ?? 'dashboard') : 'dashboard';

  const languageCookieName = config.production ? '__Host-sentinel_ui_lang' : 'sentinel_ui_lang';
  reply.setCookie(languageCookieName, uiLanguage, {
    path: '/', httpOnly: true, secure: config.production, sameSite: 'lax', maxAge: 600
  });
  const intentCookieName = config.production ? '__Host-sentinel_oauth_intent' : 'sentinel_oauth_intent';
  reply.setCookie(intentCookieName, authIntent, {
    path: '/', httpOnly: true, secure: config.production, sameSite: 'lax', maxAge: 600
  });

  const state = randomToken();
  reply.setCookie(config.production ? '__Host-discord_oauth_state' : 'discord_oauth_state', state, {
    path: '/', httpOnly: true, secure: config.production, sameSite: 'lax', maxAge: 600
  });
  const redirectUri = `${config.publicBaseUrl}/auth/discord/callback`;
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'identify guilds');
  url.searchParams.set('state', state);
  return reply.redirect(url.toString());
});

app.get('/auth/discord/callback', async (request, reply) => {
  const query = z.object({ code: z.string(), state: z.string() }).safeParse(request.query);
  const stateCookieName = config.production ? '__Host-discord_oauth_state' : 'discord_oauth_state';
  const stateCookie = request.cookies[stateCookieName];
  const stateMatches = query.success && stateCookie && query.data.state.length === stateCookie.length && crypto.timingSafeEqual(Buffer.from(query.data.state), Buffer.from(stateCookie));
  if (!query.success || !stateMatches) {
    return reply.code(400).send({ error: 'INVALID_OAUTH_STATE' });
  }
  reply.clearCookie(stateCookieName, { path: '/', secure: config.production, sameSite: 'lax' });
  const languageCookieName = config.production ? '__Host-sentinel_ui_lang' : 'sentinel_ui_lang';
  const uiLanguage = request.cookies[languageCookieName] === 'en' ? 'en' : 'it';
  reply.clearCookie(languageCookieName, { path: '/', secure: config.production, sameSite: 'lax' });

  const intentCookieName = config.production ? '__Host-sentinel_oauth_intent' : 'sentinel_oauth_intent';
  const authIntent = request.cookies[intentCookieName] === 'invite' ? 'invite' : 'dashboard';
  reply.clearCookie(intentCookieName, { path: '/', secure: config.production, sameSite: 'lax' });

  const redirectUri = `${config.publicBaseUrl}/auth/discord/callback`;
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'authorization_code',
    code: query.data.code,
    redirect_uri: redirectUri
  });
  const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(8_000)
  });
  if (!tokenResponse.ok) return reply.code(502).send({ error: 'DISCORD_TOKEN_EXCHANGE_FAILED' });
  const token = z.object({ access_token: z.string().min(16).max(2048) }).parse(await tokenResponse.json());
  const headers = { Authorization: `Bearer ${token.access_token}` };
  const [userResponse, guildResponse] = await Promise.all([
    fetch('https://discord.com/api/v10/users/@me', { headers, signal: AbortSignal.timeout(8_000) }),
    fetch('https://discord.com/api/v10/users/@me/guilds', { headers, signal: AbortSignal.timeout(8_000) })
  ]);
  if (!userResponse.ok || !guildResponse.ok) return reply.code(502).send({ error: 'DISCORD_PROFILE_FETCH_FAILED' });
  const user = await userResponse.json() as { id: string; username: string; global_name?: string | null; avatar?: string | null };
  const guilds = await guildResponse.json() as OAuthGuild[];
  await createSession(request, reply, user, guilds);

  if (authIntent === 'invite') {
    if (!(await canInstallBot(user.id))) {
      return reply.redirect(`${config.webUrl}/${uiLanguage}/development`);
    }
    return reply.redirect(botInstallUrl());
  }

  return reply.redirect(`${config.webUrl}/${uiLanguage}/dashboard`);
});

app.post('/auth/logout', async (request, reply) => {
  await destroySession(request, reply);
  return { ok: true };
});

app.get('/api/me', async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  return {
    userId: session.userId,
    username: session.username,
    avatarUrl: session.avatarUrl,
    superAdmin: isSuperAdminUserId(session.userId)
  };
});

app.get('/api/super/overview', async (request, reply) => {
  const session = await requireSuperAdmin(request, reply);
  if (!session) return;

  const guilds = await getBotGuilds();
  const [blocks, audit, settingsRows] = await Promise.all([
    prisma.installBlock.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.superAdminAudit.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.guildSettings.findMany({
      where: { guildId: { in: guilds.map((guild) => guild.id) } },
      select: { guildId: true, premiumEnabled: true }
    })
  ]);

  const guildBlocks = new Set(blocks.filter((block) => block.kind === 'GUILD').map((block) => block.subjectId));
  const premiumMap = new Map(settingsRows.map((row) => [row.guildId, row.premiumEnabled]));
  return {
    guilds: guilds.map((guild) => ({
      ...guild,
      blocked: guildBlocks.has(guild.id),
      premiumEnabled: premiumMap.get(guild.id) ?? false
    })),
    blocks,
    audit: audit.map((row) => ({ ...row, details: unprotectJson(row.details) }))
  };
});

app.put('/api/super/blocks/:kind/:subjectId', async (request, reply) => {
  const session = await requireSuperAdmin(request, reply);
  if (!session) return;

  const params = z.object({
    kind: z.enum(['USER', 'GUILD']),
    subjectId: snowflake
  }).safeParse(request.params);
  const body = z.object({ reason: z.string().trim().max(500).optional() }).safeParse(request.body ?? {});
  if (!params.success || !body.success) return reply.code(400).send({ error: 'INVALID_BLOCK_REQUEST' });

  const { kind, subjectId } = params.data;
  if (kind === 'USER' && subjectId === config.superAdminUserId) {
    return reply.code(400).send({ error: 'CANNOT_BLOCK_SUPER_ADMIN' });
  }

  const block = await prisma.installBlock.upsert({
    where: { kind_subjectId: { kind, subjectId } },
    update: { reason: body.data.reason || null, createdByUserId: session.userId },
    create: { kind, subjectId, reason: body.data.reason || null, createdByUserId: session.userId }
  });

  let left = false;
  if (kind === 'GUILD') {
    try {
      await leaveBotGuild(subjectId);
      left = true;
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      if (status !== 404) request.log.warn({ err: error, guildId: subjectId }, 'Unable to immediately leave blocked guild');
    }
  }

  await superAdminAudit(request, session, 'install_block.upsert', kind, subjectId, {
    reason: body.data.reason || null,
    left
  });
  return { ok: true, block, left };
});

app.delete('/api/super/blocks/:kind/:subjectId', async (request, reply) => {
  const session = await requireSuperAdmin(request, reply);
  if (!session) return;

  const params = z.object({
    kind: z.enum(['USER', 'GUILD']),
    subjectId: snowflake
  }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: 'INVALID_BLOCK_REQUEST' });

  const { kind, subjectId } = params.data;
  await prisma.installBlock.deleteMany({ where: { kind, subjectId } });
  await superAdminAudit(request, session, 'install_block.delete', kind, subjectId);
  return { ok: true };
});

app.put('/api/super/guilds/:guildId/premium', async (request, reply) => {
  const session = await requireSuperAdmin(request, reply);
  if (!session) return;
  const { guildId } = request.params as { guildId: string };
  const parsed = z.object({ premiumEnabled: z.boolean() }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'INVALID_BODY' });

  const existing = await prisma.guildSettings.findUnique({ where: { guildId }, select: { guildId: true } });
  if (!existing) return reply.code(404).send({ error: 'GUILD_NOT_FOUND' });

  const noisyKeys = EVENT_CATALOG.filter((event) => event.noisy).map((event) => event.key);
  const premiumEnabled = parsed.data.premiumEnabled;

  await prisma.$transaction([
    prisma.guildSettings.update({
      where: { guildId },
      data: {
        premiumEnabled,
        ...(!premiumEnabled ? {
          rawGatewayEnabled: false,
          presenceLoggingEnabled: false,
          typingLoggingEnabled: false
        } : {})
      }
    }),
    ...(!premiumEnabled ? [
      prisma.logRoute.updateMany({
        where: { guildId, eventKey: { in: noisyKeys } },
        data: { captureEnabled: false, enabled: false }
      })
    ] : [])
  ]);

  await superAdminAudit(request, session, premiumEnabled ? 'premium.enable' : 'premium.disable', 'GUILD', guildId, {
    premiumEnabled
  });

  return { ok: true, guildId, premiumEnabled };
});

app.post('/api/super/guilds/:guildId/leave', async (request, reply) => {
  const session = await requireSuperAdmin(request, reply);
  if (!session) return;
  const { guildId } = request.params as { guildId: string };

  try {
    await leaveBotGuild(guildId);
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 404) return reply.code(404).send({ error: 'GUILD_NOT_CONNECTED' });
    throw error;
  }

  await superAdminAudit(request, session, 'guild.leave', 'GUILD', guildId);
  return { ok: true };
});

app.get('/api/catalog', async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  return EVENT_CATALOG;
});

app.get('/api/guilds', async (request, reply) => {
  const session = await requireSession(request, reply);
  if (!session) return;
  const memberGuildIds = session.guilds.map((guild) => guild.id);
  const installed = await prisma.guildSettings.findMany({
    where: { guildId: { in: memberGuildIds } },
    orderBy: { guildName: 'asc' }
  });
  const guildMeta = new Map(session.guilds.map((guild) => [guild.id, guild]));
  const rows = await Promise.all(installed.map(async (guild) => ({
    ...guild,
    oauth: guildMeta.get(guild.guildId) ?? null,
    access: await resolveGuildAccess(session, guild.guildId)
  })));
  return rows.filter((guild) => guild.access);
});

app.get('/api/guilds/:guildId/access', async (request, reply) => {
  const { guildId } = request.params as { guildId: string };
  const session = await requireGuild(request, reply, guildId);
  if (!session) return;
  return { access: session.access };
});

const settingsSchema = z.object({
  defaultLogChannelId: optionalSnowflake,
  timezone: z.string().trim().min(1).max(64).refine(isValidTimeZone, 'Unknown IANA time zone').optional(),
  locale: z.enum(['en', 'it']).optional(),
  defaultRetentionDays: z.number().int().min(1).max(3650).optional(),
  embedColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  embedFooter: z.string().trim().max(200).optional(),
  messageSnapshotEnabled: z.boolean().optional(),
  storeMessageContent: z.boolean().optional(),
  rawGatewayEnabled: z.boolean().optional(),
  presenceLoggingEnabled: z.boolean().optional(),
  typingLoggingEnabled: z.boolean().optional()
});

const routeSchema = z.object({
  captureEnabled: z.boolean().optional(),
  enabled: z.boolean().optional(),
  destinationChannelId: optionalSnowflake,
  customTitle: z.string().max(256).nullable().optional(),
  customFooter: z.string().max(200).nullable().optional(),
  textPrefix: z.string().max(500).nullable().optional(),
  thumbnailUrl: z.string().url().max(2000).refine((value) => value.startsWith('https://')).nullable().optional(),
  embedColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  showTimestamp: z.boolean().optional(),
  showActor: z.boolean().optional(),
  showTarget: z.boolean().optional(),
  showChannel: z.boolean().optional(),
  includeContent: z.boolean().optional(),
  includeAttachments: z.boolean().optional(),
  ignoreBots: z.boolean().optional(),
  retentionDays: z.number().int().min(1).max(3650).nullable().optional(),
  ignoredUserIds: z.array(snowflake).max(100).optional(),
  ignoredRoleIds: z.array(snowflake).max(100).optional(),
  ignoredChannelIds: z.array(snowflake).max(100).optional(),
  mentionRoleIds: z.array(snowflake).max(20).optional()
});

type GuildReferences = Parameters<typeof findForeignReference>[1];

// Channel and role IDs come from the browser: confirm through the bot that
// they belong to this guild before storing them.
const ensureGuildReferences = async (request: FastifyRequest, reply: FastifyReply, guildId: string, refs: GuildReferences) => {
  const ids = [...(refs.channelIds ?? []), ...(refs.sendableChannelIds ?? []), ...(refs.roleIds ?? [])].filter(Boolean);
  if (!ids.length) return true;
  let resources: Awaited<ReturnType<typeof getGuildResources>>;
  try {
    resources = await getGuildResources(guildId);
  } catch (error) {
    request.log.error({ err: error }, 'Unable to verify guild references');
    reply.code(502).send({ error: 'DISCORD_RESOURCES_FAILED' });
    return false;
  }
  const foreign = findForeignReference(resources, refs);
  if (foreign) {
    reply.code(400).send({ error: 'UNKNOWN_GUILD_REFERENCE', id: foreign });
    return false;
  }
  return true;
};

app.get('/api/guilds/:guildId/settings', async (request, reply) => {
  const { guildId } = request.params as { guildId: string };
  const session = await requireGuild(request, reply, guildId);
  if (!session) return;
  return prisma.guildSettings.findUnique({ where: { guildId } });
});

app.put('/api/guilds/:guildId/settings', async (request, reply) => {
  const { guildId } = request.params as { guildId: string };
  const session = await requireGuild(request, reply, guildId, 'ADMIN');
  if (!session) return;
  const parsed = settingsSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'INVALID_BODY', details: parsed.error.flatten() });

  const wantsHighVolumeAcquisition =
    parsed.data.rawGatewayEnabled === true ||
    parsed.data.presenceLoggingEnabled === true ||
    parsed.data.typingLoggingEnabled === true;

  if (wantsHighVolumeAcquisition) {
    const guild = await prisma.guildSettings.findUnique({ where: { guildId }, select: { premiumEnabled: true } });
    if (!guild?.premiumEnabled) return reply.code(403).send({ error: 'PREMIUM_REQUIRED' });
  }

  if (!(await ensureGuildReferences(request, reply, guildId, { sendableChannelIds: [parsed.data.defaultLogChannelId] }))) return;

  const updated = await prisma.guildSettings.update({ where: { guildId }, data: parsed.data });
  await panelAudit(request, session, guildId, 'settings.update', parsed.data);
  return updated;
});

app.get('/api/guilds/:guildId/routes', async (request, reply) => {
  const { guildId } = request.params as { guildId: string };
  const session = await requireGuild(request, reply, guildId);
  if (!session) return;
  const routes = await prisma.logRoute.findMany({ where: { guildId }, orderBy: { eventKey: 'asc' } });
  const routeMap = new Map(routes.map((route) => [route.eventKey, route]));
  return EVENT_CATALOG.map((event) => ({ event, route: routeMap.get(event.key) ?? null }));
});

app.put('/api/guilds/:guildId/routes/:eventKey', async (request, reply) => {
  const { guildId, eventKey } = request.params as { guildId: string; eventKey: string };
  const session = await requireGuild(request, reply, guildId, 'ADMIN');
  if (!session) return;
  const eventDefinition = EVENT_CATALOG.find((event) => event.key === eventKey);
  if (!eventDefinition) return reply.code(404).send({ error: 'UNKNOWN_EVENT' });
  const parsed = routeSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'INVALID_BODY', details: parsed.error.flatten() });

  if (eventDefinition.noisy && (parsed.data.enabled === true || parsed.data.captureEnabled === true)) {
    const guild = await prisma.guildSettings.findUnique({ where: { guildId }, select: { premiumEnabled: true } });
    if (!guild?.premiumEnabled) return reply.code(403).send({ error: 'PREMIUM_REQUIRED' });
  }

  // Only IDs added by this request are verified, so lists that still contain
  // a since-deleted channel or role can always be cleaned up.
  const current = await prisma.logRoute.findUnique({
    where: { guildId_eventKey: { guildId, eventKey } },
    select: { ignoredChannelIds: true, ignoredRoleIds: true, mentionRoleIds: true }
  });
  const added = (next: string[] | undefined, previous: string[] | undefined) =>
    (next ?? []).filter((id) => !(previous ?? []).includes(id));
  const referencesValid = await ensureGuildReferences(request, reply, guildId, {
    sendableChannelIds: [parsed.data.destinationChannelId],
    channelIds: added(parsed.data.ignoredChannelIds, current?.ignoredChannelIds),
    roleIds: [
      ...added(parsed.data.ignoredRoleIds, current?.ignoredRoleIds),
      ...added(parsed.data.mentionRoleIds, current?.mentionRoleIds)
    ]
  });
  if (!referencesValid) return;

  const route = await prisma.logRoute.upsert({
    where: { guildId_eventKey: { guildId, eventKey } },
    update: parsed.data,
    create: {
      guildId,
      eventKey,
      captureEnabled: eventDefinition.noisy ? false : true,
      enabled: eventDefinition.noisy ? false : true,
      ...parsed.data
    }
  });
  await panelAudit(request, session, guildId, 'route.update', { eventKey, ...parsed.data });
  return route;
});

app.post('/api/guilds/:guildId/routes/bulk', async (request, reply) => {
  const { guildId } = request.params as { guildId: string };
  const session = await requireGuild(request, reply, guildId, 'ADMIN');
  if (!session) return;
  const parsed = z.object({
    enabled: z.boolean().optional(),
    captureEnabled: z.boolean().optional(),
    includeNoisy: z.boolean().default(false)
  }).refine((value) => value.enabled !== undefined || value.captureEnabled !== undefined).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'INVALID_BODY' });

  const wantsNoisyActivation =
    parsed.data.includeNoisy &&
    (parsed.data.enabled === true || parsed.data.captureEnabled === true);

  if (wantsNoisyActivation) {
    const guild = await prisma.guildSettings.findUnique({ where: { guildId }, select: { premiumEnabled: true } });
    if (!guild?.premiumEnabled) return reply.code(403).send({ error: 'PREMIUM_REQUIRED' });
  }

  const keys = EVENT_CATALOG.filter((event) => parsed.data.includeNoisy || !event.noisy).map((event) => event.key);
  const data = {
    ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
    ...(parsed.data.captureEnabled !== undefined ? { captureEnabled: parsed.data.captureEnabled } : {})
  };
  await prisma.logRoute.updateMany({ where: { guildId, eventKey: { in: keys } }, data });
  await panelAudit(request, session, guildId, 'route.bulk', parsed.data);
  return { ok: true, affected: keys.length };
});

app.get('/api/guilds/:guildId/resources', async (request, reply) => {
  const { guildId } = request.params as { guildId: string };
  const session = await requireGuild(request, reply, guildId);
  if (!session) return;
  try {
    return await getGuildResources(guildId);
  } catch (error) {
    request.log.error(error);
    return reply.code(502).send({ error: 'DISCORD_RESOURCES_FAILED' });
  }
});

app.get('/api/guilds/:guildId/events', async (request, reply) => {
  const { guildId } = request.params as { guildId: string };
  const session = await requireGuild(request, reply, guildId);
  if (!session) return;
  const parsed = z.object({
    eventKey: z.string().max(100).refine((value) => EVENT_CATALOG.some((event) => event.key === value)).optional(),
    actorId: snowflake.optional(),
    targetId: snowflake.optional(),
    channelId: snowflake.optional(),
    q: z.string().max(200).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    take: z.coerce.number().int().min(1).max(200).default(50)
  }).safeParse(request.query);
  if (!parsed.success) return reply.code(400).send({ error: 'INVALID_QUERY' });
  const { page, take, ...filters } = parsed.data;
  const where = {
    guildId,
    ...(filters.eventKey ? { eventKey: filters.eventKey } : {}),
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    ...(filters.targetId ? { targetId: filters.targetId } : {}),
    ...(filters.channelId ? { channelId: filters.channelId } : {}),
    ...(filters.q ? { summary: { contains: filters.q, mode: 'insensitive' as const } } : {}),
    ...((filters.from || filters.to) ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {})
  };
  const [items, total] = await Promise.all([
    prisma.logEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * take, take }),
    prisma.logEvent.count({ where })
  ]);
  return { items: items.map((item) => ({ ...item, details: unprotectJson(item.details) })), total, page, take, pages: Math.max(1, Math.ceil(total / take)) };
});

app.get('/api/guilds/:guildId/stats', async (request, reply) => {
  const { guildId } = request.params as { guildId: string };
  const session = await requireGuild(request, reply, guildId);
  if (!session) return;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [last24h, today, snapshots, deliveryIssues, groups, lastEvent] = await Promise.all([
    prisma.logEvent.count({ where: { guildId, createdAt: { gte: since } } }),
    prisma.logEvent.count({ where: { guildId, createdAt: { gte: todayStart } } }),
    prisma.messageSnapshot.count({ where: { guildId } }),
    prisma.logEvent.count({ where: { guildId, createdAt: { gte: since }, dispatchState: { in: ['FAILED', 'QUEUE_ERROR', 'CHANNEL_UNAVAILABLE', 'GUILD_UNAVAILABLE'] } } }),
    prisma.logEvent.groupBy({ by: ['eventKey'], where: { guildId, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.logEvent.findFirst({ where: { guildId }, orderBy: { createdAt: 'desc' } })
  ]);
  return { last24h, today, snapshots, deliveryIssues, groups: groups.map((g) => ({ eventKey: g.eventKey, count: g._count._all })).sort((a, b) => b.count - a.count).slice(0, 12), lastEventAt: lastEvent?.createdAt ?? null };
});

app.get('/api/guilds/:guildId/panel-audit', async (request, reply) => {
  const { guildId } = request.params as { guildId: string };
  const session = await requireGuild(request, reply, guildId, 'ADMIN');
  if (!session) return;
  const rows = await prisma.panelAudit.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' }, take: 200 });
  return rows.map((row) => ({ ...row, details: unprotectJson(row.details) }));
});

app.get('/api/guilds/:guildId/access-bindings', async (request, reply) => {
  const { guildId } = request.params as { guildId: string };
  const session = await requireGuild(request, reply, guildId, 'ADMIN');
  if (!session) return;
  return prisma.panelRoleBinding.findMany({ where: { guildId }, orderBy: { createdAt: 'asc' } });
});

app.put('/api/guilds/:guildId/access-bindings/:roleId', async (request, reply) => {
  const { guildId, roleId } = request.params as { guildId: string; roleId: string };
  const session = await requireGuild(request, reply, guildId, 'ADMIN');
  if (!session) return;
  const parsed = z.object({ accessLevel: z.enum(['VIEWER', 'MODERATOR', 'ADMIN']) }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'INVALID_BODY' });
  if (roleId === guildId) return reply.code(400).send({ error: 'EVERYONE_ROLE_NOT_ALLOWED' });
  if (!(await ensureGuildReferences(request, reply, guildId, { roleIds: [roleId] }))) return;
  const binding = await prisma.panelRoleBinding.upsert({
    where: { guildId_discordRoleId: { guildId, discordRoleId: roleId } },
    update: { accessLevel: parsed.data.accessLevel },
    create: { guildId, discordRoleId: roleId, accessLevel: parsed.data.accessLevel }
  });
  await panelAudit(request, session, guildId, 'access_binding.update', { roleId, accessLevel: parsed.data.accessLevel });
  return binding;
});

app.delete('/api/guilds/:guildId/access-bindings/:roleId', async (request, reply) => {
  const { guildId, roleId } = request.params as { guildId: string; roleId: string };
  const session = await requireGuild(request, reply, guildId, 'ADMIN');
  if (!session) return;
  await prisma.panelRoleBinding.deleteMany({ where: { guildId, discordRoleId: roleId } });
  await panelAudit(request, session, guildId, 'access_binding.delete', { roleId });
  return { ok: true };
});

app.delete('/api/guilds/:guildId/privacy/user/:userId', async (request, reply) => {
  const { guildId, userId } = request.params as { guildId: string; userId: string };
  const session = await requireGuild(request, reply, guildId, 'ADMIN');
  if (!session) return;
  const [snapshots, events] = await prisma.$transaction([
    prisma.messageSnapshot.deleteMany({ where: { guildId, authorId: userId } }),
    prisma.logEvent.deleteMany({ where: { guildId, OR: [{ actorId: userId }, { targetId: userId }] } })
  ]);
  await panelAudit(request, session, guildId, 'privacy.user_delete', { userId, snapshots: snapshots.count, events: events.count });
  return { ok: true, deletedSnapshots: snapshots.count, deletedEvents: events.count };
});

app.get('/api/guilds/:guildId/export', async (request, reply) => {
  const { guildId } = request.params as { guildId: string };
  const session = await requireGuild(request, reply, guildId, 'MODERATOR');
  if (!session) return;
  const query = z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    eventKey: z.string().max(100).refine((value) => EVENT_CATALOG.some((event) => event.key === value)).optional()
  }).safeParse(request.query);
  if (!query.success) return reply.code(400).send({ error: 'INVALID_QUERY' });

  const where = {
    guildId,
    ...(query.data.eventKey ? { eventKey: query.data.eventKey } : {}),
    ...((query.data.from || query.data.to) ? { createdAt: { ...(query.data.from ? { gte: query.data.from } : {}), ...(query.data.to ? { lte: query.data.to } : {}) } } : {})
  };
  const limit = 50_000;
  const total = Math.min(await prisma.logEvent.count({ where }), limit);
  await panelAudit(request, session, guildId, 'events.export', { count: total, filters: query.data });

  // Keyset pagination keeps memory flat regardless of the export size.
  async function* pages() {
    const pageSize = 1000;
    let cursor: string | undefined;
    let sent = 0;
    while (sent < limit) {
      const page = await prisma.logEvent.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: Math.min(pageSize, limit - sent),
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
      });
      if (!page.length) return;
      sent += page.length;
      cursor = page[page.length - 1]!.id;
      yield page;
      if (page.length < pageSize) return;
    }
  }

  const decrypt = (event: { details: unknown }) => {
    try {
      return unprotectJson(event.details);
    } catch {
      return { error: 'DETAILS_UNREADABLE' };
    }
  };

  reply.header('Content-Type', 'application/json; charset=utf-8');
  reply.header('Content-Disposition', `attachment; filename="discord-audit-${guildId}-${new Date().toISOString().slice(0, 10)}.json"`);
  return reply.send(Readable.from(exportJsonChunks(
    { exportedAt: new Date().toISOString(), guildId },
    pages(),
    (event) => ({ ...event, details: decrypt(event) })
  )));
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'Shutting down');
  setTimeout(() => process.exit(1), 8_000).unref();
  await app.close().catch(() => null);
  await prisma.$disconnect().catch(() => null);
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.port, host: '0.0.0.0' });
