import crypto from 'node:crypto';
import http from 'node:http';
import { DiscordAPIError, EmbedBuilder, Routes, type Client } from 'discord.js';
import { editOwnGuildProfile, leaveGuild } from './discord-actions.js';
import type { StatusNotifier } from './status.js';
import { LOG_LEVEL_RANK, type LogLevelName } from '@sentinel/shared';
import { logBuffer } from './logger.js';
import { sendStatusMessage } from './dispatcher.js';
import { truncate } from './embed-format.js';
import { redactText } from './security.js';

const SNOWFLAKE = /^\d{17,20}$/;

function authorized(header: string | undefined, secret: string) {
  const expected = `Bearer ${secret}`;
  if (!header || header.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

const MAX_BODY_BYTES = 128 * 1024;
const MAX_ENTITLEMENT_PAGES = 50;

type RawEntitlement = {
  id: string;
  sku_id: string;
  guild_id?: string | null;
  type: number;
  deleted: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
};

/**
 * Active (not ended, not deleted) entitlements of the application, through a
 * read-only REST call. Only what plan sync needs leaves the bot: the buyer's
 * user ID is not passed on.
 */
async function activeEntitlements(client: Client) {
  const applicationId = client.application?.id ?? client.user?.id;
  if (!applicationId) throw new Error('APPLICATION_UNAVAILABLE');
  const result: Array<{ id: string; skuId: string; guildId: string | null; type: number; startsAt: string | null; endsAt: string | null }> = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_ENTITLEMENT_PAGES; page += 1) {
    const query = new URLSearchParams({ exclude_ended: 'true', exclude_deleted: 'true', limit: '100' });
    if (after) query.set('after', after);
    const rows = await client.rest.get(Routes.entitlements(applicationId), { query }) as RawEntitlement[];
    for (const row of rows) {
      if (row.deleted) continue;
      result.push({ id: row.id, skuId: row.sku_id, guildId: row.guild_id ?? null, type: row.type, startsAt: row.starts_at ?? null, endsAt: row.ends_at ?? null });
    }
    if (rows.length < 100) return result;
    // Pages are ordered by ID; continue after the highest one seen.
    after = rows.reduce((max, row) => (BigInt(row.id) > BigInt(max) ? row.id : max), rows[0]!.id);
  }
  throw new Error('TOO_MANY_ENTITLEMENTS');
}
const BANNER_URI = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

class RequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new RequestError(413, 'BODY_TOO_LARGE');
    chunks.push(chunk as Buffer);
  }
  if (!size) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value as Record<string, unknown>;
  } catch {
    throw new RequestError(400, 'INVALID_JSON');
  }
}

export function startInternalApi(client: Client, secret: string, port = 3002, status?: StatusNotifier) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET' && req.url === '/healthz') {
      const ready = client.isReady();
      res.statusCode = ready ? 200 : 503;
      res.end(JSON.stringify({ ok: ready, service: 'bot', guilds: client.guilds.cache.size }));
      return;
    }

    if (!authorized(req.headers.authorization, secret)) {
      res.statusCode = 401;
      res.end('{"error":"UNAUTHORIZED"}');
      return;
    }
    try {
      const url = new URL(req.url ?? '/', 'http://internal');

      if (req.method === 'GET' && url.pathname === '/guilds') {
        const guilds = [...client.guilds.cache.values()].map((guild) => ({
          id: guild.id,
          name: guild.name,
          ownerId: guild.ownerId,
          ownerTag: guild.members.cache.get(guild.ownerId)?.user?.tag ?? null,
          memberCount: guild.memberCount,
          iconUrl: guild.iconURL()
        })).sort((a, b) => a.name.localeCompare(b.name));
        res.end(JSON.stringify(guilds));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/logs') {
        const requested = url.searchParams.get('level') ?? 'info';
        const level = (requested in LOG_LEVEL_RANK ? requested : 'info') as LogLevelName;
        const limit = Math.min(1_000, Math.max(1, Number(url.searchParams.get('limit')) || 500));
        res.end(JSON.stringify(logBuffer.list(level, limit)));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/entitlements') {
        res.end(JSON.stringify(await activeEntitlements(client)));
        return;
      }

      let match = url.pathname.match(/^\/guilds\/(\d{17,20})\/leave$/);
      if (req.method === 'POST' && match) {
        const guildId = match[1]!;
        const guild = client.guilds.cache.get(guildId);
        if (!guild) throw new Error('GUILD_NOT_FOUND');
        await leaveGuild(guild, 'super-console');
        res.end(JSON.stringify({ ok: true, guildId }));
        return;
      }

      match = url.pathname.match(/^\/guilds\/(\d{17,20})\/resources$/);
      if (req.method === 'GET' && match) {
        const guildId = match[1]!;
        const guild = client.guilds.cache.get(guildId);
        if (!guild) throw new Error('GUILD_NOT_FOUND');
        const [channels, roles] = await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
        res.end(JSON.stringify({
          channels: [...channels.values()].filter(Boolean).map((c: any) => ({ id: c.id, name: c.name, type: c.type, parent_id: c.parentId ?? null, position: c.position ?? 0 })).sort((a, b) => a.position - b.position),
          roles: [...roles.values()].map((r) => ({ id: r.id, name: r.name, color: r.color, position: r.position, permissions: r.permissions.bitfield.toString() })).sort((a, b) => b.position - a.position)
        }));
        return;
      }

      match = url.pathname.match(/^\/guilds\/(\d{17,20})\/members\/(\d{17,20})\/access$/);
      if (req.method === 'GET' && match) {
        const guildId = match[1]!;
        const userId = match[2]!;
        if (!SNOWFLAKE.test(guildId) || !SNOWFLAKE.test(userId)) throw new Error('INVALID_ID');
        const guild = client.guilds.cache.get(guildId);
        if (!guild) throw new Error('GUILD_NOT_FOUND');
        const member = await guild.members.fetch(userId);
        res.end(JSON.stringify({ owner: guild.ownerId === userId, permissions: member.permissions.bitfield.toString(), roles: [...member.roles.cache.keys()] }));
        return;
      }

      match = url.pathname.match(/^\/guilds\/(\d{17,20})\/branding$/);
      if (req.method === 'POST' && match) {
        const guildId = match[1]!;
        if (!client.guilds.cache.has(guildId)) throw new Error('GUILD_NOT_FOUND');
        const body = await readJson(req);
        const profile: { nick?: string | null; banner?: string | null } = {};
        if ('nick' in body) {
          if (body.nick !== null && (typeof body.nick !== 'string' || !body.nick.trim() || body.nick.length > 32)) throw new RequestError(400, 'INVALID_NICKNAME');
          profile.nick = body.nick === null ? null : (body.nick as string).trim();
        }
        if ('banner' in body) {
          if (body.banner !== null && (typeof body.banner !== 'string' || !BANNER_URI.test(body.banner))) throw new RequestError(400, 'INVALID_BANNER');
          profile.banner = body.banner as string | null;
        }
        try {
          await editOwnGuildProfile(client, guildId, profile);
        } catch (error) {
          if (error instanceof DiscordAPIError) {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: 'DISCORD_REJECTED', status: error.status, code: error.code, message: error.message.slice(0, 300) }));
            return;
          }
          throw error;
        }
        res.end(JSON.stringify({ ok: true, guildId }));
        return;
      }

      // Alerts routed by the API (super console → Monitoring) to a channel of a
      // server the bot is in. The channel check matches log delivery.
      if (req.method === 'POST' && url.pathname === '/alerts/deliver') {
        const body = await readJson(req);
        const guildId = String(body.guildId ?? '');
        const channelId = String(body.channelId ?? '');
        const mention = body.mentionUserId == null ? null : String(body.mentionUserId);
        if (!SNOWFLAKE.test(guildId) || !SNOWFLAKE.test(channelId) || (mention !== null && !SNOWFLAKE.test(mention))) throw new RequestError(400, 'INVALID_TARGET');
        const embed = new EmbedBuilder()
          .setTitle(truncate(String(body.title ?? 'Sentinel'), 256))
          .setColor(Number(body.color) || 0xa78bfa)
          .setFooter({ text: truncate(String(body.footer ?? 'Sentinel · allarmi'), 200) })
          .setTimestamp(new Date());
        if (body.description) embed.setDescription(truncate(redactText(String(body.description)), 4000));
        const fields = Array.isArray(body.fields) ? body.fields as Array<{ name?: unknown; value?: unknown }> : [];
        const safeFields = fields.filter((field) => field?.value).slice(0, 20)
          .map((field) => ({ name: truncate(String(field.name ?? '—'), 256), value: truncate(redactText(String(field.value)), 1024), inline: true }));
        if (safeFields.length) embed.addFields(safeFields);
        try {
          await sendStatusMessage(client, guildId, channelId, embed, mention);
        } catch (error) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: error instanceof Error ? error.message.slice(0, 200) : 'SEND_FAILED' }));
          return;
        }
        res.end('{"ok":true}');
        return;
      }

      if (req.method === 'POST' && url.pathname === '/status/test') {
        if (!status) throw new Error('STATUS_UNAVAILABLE');
        status.invalidate();
        const result = await status.deliver({
          level: 'info',
          category: 'availability',
          severity: 'info',
          title: 'Notifiche di stato attive',
          description: 'Messaggio di prova inviato dalla super console. Qui arriveranno avvio del bot, errori e server aggiunti o rimossi.'
        }, { force: true });
        res.end(JSON.stringify(result));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/status/refresh') {
        status?.invalidate();
        res.end('{"ok":true}');
        return;
      }

      if (!['GET', 'POST'].includes(req.method ?? '')) {
        res.statusCode = 405;
        res.end('{"error":"METHOD_NOT_ALLOWED"}');
        return;
      }
      res.statusCode = 404;
      res.end('{"error":"NOT_FOUND"}');
    } catch (error) {
      res.statusCode = error instanceof RequestError ? error.status : 404;
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'INTERNAL_ERROR' }));
    }
  });
  server.keepAliveTimeout = 5_000;
  server.headersTimeout = 6_000;
  server.requestTimeout = 10_000;
  server.listen(port, '0.0.0.0');
  return server;
}
