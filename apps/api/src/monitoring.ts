import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@sentinel/db';
import { LOG_LEVEL_RANK, type LogBuffer, type LogLevelName } from '@sentinel/shared';
import { requireSuperAdmin } from './auth.js';
import { botHealth, getBotLogs } from './discord.js';
import { decryptText, encryptText, protectJson, unprotectJson } from './security.js';
import { superAdminAudit } from './super-audit.js';

/**
 * Super console monitoring: the bot watchdog with "down" and "restored"
 * alarms, the instance event feed and the latest logs of the API and the bot.
 *
 * Alarms go to a Discord webhook, not through the bot: they must reach you
 * precisely when the bot is not running.
 */

type Logger = { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void };
type Level = 'info' | 'ok' | 'warn' | 'error';

const CHECK_INTERVAL_MS = 30_000;
/**
 * Consecutive failed checks before the bot is declared down (about two
 * minutes): a deploy restarts the bot in less, without raising an alarm.
 */
const FAILURES_BEFORE_DOWN = 4;
const EVENT_RETENTION_DAYS = 90;
const WEBHOOK = /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d{17,20}\/[\w-]{20,}$/;
const COLORS: Record<Level, number> = { info: 0xa78bfa, ok: 0x3ccf8e, warn: 0xf5a524, error: 0xf2555a };

type BotState = { status: 'unknown' | 'up' | 'down'; since: string; lastCheck: string | null; failures: number; guilds: number | null };
const state: BotState = { status: 'unknown', since: new Date().toISOString(), lastCheck: null, failures: 0, guilds: null };
export const botState = () => ({ ...state });

const formatDuration = (ms: number) => {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
};

export async function recordEvent(level: Level, title: string, description: string | null = null) {
  await prisma.instanceEvent.create({ data: { source: 'api', level, title, details: protectJson({ description, fields: [] }) } });
}

async function webhookUrl() {
  const row = await prisma.instanceConfig.findUnique({ where: { id: 1 }, select: { alertWebhookUrl: true } });
  return row?.alertWebhookUrl ? decryptText(row.alertWebhookUrl) : null;
}

async function postWebhook(url: string, level: Level, title: string, description: string) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'Sentinel monitor',
      allowed_mentions: { parse: [] },
      embeds: [{ title, description, color: COLORS[level], timestamp: new Date().toISOString(), footer: { text: 'Sentinel · monitoraggio' } }]
    }),
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) throw new Error(`Webhook responded ${response.status}`);
}

async function alarm(level: Level, title: string, description: string, log: Logger) {
  await recordEvent(level, title, description).catch((error) => log.warn({ err: error }, 'Unable to record instance event'));
  const url = await webhookUrl().catch(() => null);
  if (!url) return;
  await postWebhook(url, level, title, description).catch((error) => log.warn({ err: error }, 'Alarm webhook failed'));
}

async function checkBot(log: Logger) {
  const now = new Date();
  const health = await botHealth().catch(() => null);
  state.lastCheck = now.toISOString();
  if (health?.ok) {
    state.guilds = health.guilds;
    state.failures = 0;
    if (state.status === 'down') {
      const downtime = formatDuration(now.getTime() - new Date(state.since).getTime());
      await alarm('ok', 'Bot ripristinato', `Sentinel è di nuovo connesso a Discord dopo ${downtime} di interruzione (${health.guilds} server).`, log);
    }
    if (state.status !== 'up') {
      state.status = 'up';
      state.since = now.toISOString();
    }
    return;
  }
  state.failures += 1;
  if (state.failures >= FAILURES_BEFORE_DOWN && state.status !== 'down') {
    const wasUp = state.status === 'up';
    state.status = 'down';
    state.since = now.toISOString();
    await alarm('error', 'Bot non raggiungibile', health
      ? 'Il processo del bot risponde ma non è connesso a Discord: i log non vengono registrati.'
      : `Il bot non risponde da circa ${Math.round(FAILURES_BEFORE_DOWN * CHECK_INTERVAL_MS / 60_000)} minuti${wasUp ? '' : ' (dall’avvio dell’API)'}: i log non vengono registrati.`, log);
  }
}

export function startMonitoring(log: Logger) {
  setTimeout(() => void checkBot(log), 10_000).unref();
  setInterval(() => void checkBot(log), CHECK_INTERVAL_MS).unref();
  const cleanup = () => prisma.instanceEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - EVENT_RETENTION_DAYS * 86_400_000) } } }).catch(() => null);
  void cleanup();
  setInterval(() => void cleanup(), 12 * 60 * 60 * 1000).unref();
}

export async function registerMonitoringRoutes(app: FastifyInstance, apiLogs: LogBuffer) {
  // Public and detail-free, for an external uptime monitor.
  app.get('/health/bot', { logLevel: 'warn' }, async (_request, reply) => {
    const ok = state.status === 'up';
    return reply.code(ok ? 200 : 503).send({ ok, service: 'bot' });
  });

  app.get('/api/super/monitor', async (request, reply) => {
    const session = await requireSuperAdmin(request, reply);
    if (!session) return;
    const [rows, url] = await Promise.all([
      prisma.instanceEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
      webhookUrl().catch(() => null)
    ]);
    const events = rows.map((row) => {
      let details: { description?: string | null; fields?: Array<{ name: string; value: string }> } = {};
      try {
        details = unprotectJson(row.details) as typeof details;
      } catch {
        details = { description: null, fields: [] };
      }
      return { id: row.id, source: row.source, level: row.level, title: row.title, description: details.description ?? null, fields: details.fields ?? [], createdAt: row.createdAt };
    });
    return { bot: botState(), events, webhook: url ? { configured: true, hint: `…${url.slice(-6)}` } : { configured: false, hint: null } };
  });

  app.get('/api/super/logs', async (request, reply) => {
    const session = await requireSuperAdmin(request, reply);
    if (!session) return;
    const parsed = z.object({
      service: z.enum(['api', 'bot']).default('bot'),
      level: z.enum(Object.keys(LOG_LEVEL_RANK) as [LogLevelName, ...LogLevelName[]]).default('info'),
      limit: z.coerce.number().int().min(1).max(1_000).default(300)
    }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_QUERY' });
    const { service, level, limit } = parsed.data;
    if (service === 'api') return { service, entries: apiLogs.list(level, limit) };
    try {
      return { service, entries: await getBotLogs(level, limit) };
    } catch {
      return reply.code(502).send({ error: 'BOT_UNAVAILABLE' });
    }
  });

  app.put('/api/super/alert-webhook', async (request, reply) => {
    const session = await requireSuperAdmin(request, reply);
    if (!session) return;
    const parsed = z.object({ url: z.union([z.literal(''), z.string().trim().regex(WEBHOOK)]).nullable() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_WEBHOOK' });
    const url = parsed.data.url || null;
    const stored = url ? encryptText(url) : null;
    await prisma.instanceConfig.upsert({ where: { id: 1 }, update: { alertWebhookUrl: stored }, create: { id: 1, alertWebhookUrl: stored } });
    await superAdminAudit(request, session, url ? 'monitor.webhook_set' : 'monitor.webhook_removed', null, null);
    return { ok: true, configured: Boolean(url) };
  });

  app.post('/api/super/alert-webhook/test', async (request, reply) => {
    const session = await requireSuperAdmin(request, reply);
    if (!session) return;
    const url = await webhookUrl().catch(() => null);
    if (!url) return reply.code(400).send({ error: 'WEBHOOK_NOT_SET' });
    try {
      await postWebhook(url, 'info', 'Allarmi attivi', 'Messaggio di prova dalla super console: qui arriveranno gli avvisi quando il bot non è raggiungibile e quando torna attivo.');
    } catch {
      return reply.code(502).send({ error: 'WEBHOOK_FAILED' });
    }
    return { ok: true };
  });
}
