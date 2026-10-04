import crypto from 'node:crypto';
import http from 'node:http';
import type { Client } from 'discord.js';
import { leaveGuild } from './discord-actions.js';

const SNOWFLAKE = /^\d{17,20}$/;

function authorized(header: string | undefined, secret: string) {
  const expected = `Bearer ${secret}`;
  if (!header || header.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export function startInternalApi(client: Client, secret: string, port = 3002) {
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

      if (!['GET', 'POST'].includes(req.method ?? '')) {
        res.statusCode = 405;
        res.end('{"error":"METHOD_NOT_ALLOWED"}');
        return;
      }
      res.statusCode = 404;
      res.end('{"error":"NOT_FOUND"}');
    } catch (error) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'INTERNAL_ERROR' }));
    }
  });
  server.keepAliveTimeout = 5_000;
  server.headersTimeout = 6_000;
  server.requestTimeout = 10_000;
  server.listen(port, '0.0.0.0');
  return server;
}
