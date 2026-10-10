import crypto from 'node:crypto';
import http from 'node:http';
import { DiscordAPIError, type Client } from 'discord.js';
import { editOwnGuildProfile, leaveGuild } from './discord-actions.js';
import type { StatusNotifier } from './status.js';

const SNOWFLAKE = /^\d{17,20}$/;

function authorized(header: string | undefined, secret: string) {
  const expected = `Bearer ${secret}`;
  if (!header || header.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

const MAX_BODY_BYTES = 128 * 1024;
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

      if (req.method === 'POST' && url.pathname === '/status/test') {
        if (!status) throw new Error('STATUS_UNAVAILABLE');
        status.invalidate();
        const result = await status.deliver({
          level: 'info',
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
