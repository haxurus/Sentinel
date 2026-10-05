import crypto from 'node:crypto';

export const SESSION_COOKIE_NAMES = ['__Host-audit_session', 'audit_session'] as const;

/**
 * Rate-limit bucket for a request. Behind Cloudflare -> Nginx Proxy Manager ->
 * edge -> Next.js the socket address seen by the API is the same for every
 * visitor, so authenticated traffic is keyed by session instead. The session
 * token is hashed so it never ends up in memory maps or logs in clear text.
 */
export function rateLimitKey(request: { ip: string; cookies?: Record<string, string | undefined>; headers?: Record<string, string | string[] | undefined> }) {
  const token = SESSION_COOKIE_NAMES.map((name) => request.cookies?.[name]).find(Boolean);
  if (token) return `session:${crypto.createHash('sha256').update(token).digest('base64url').slice(0, 32)}`;
  return `ip:${clientIp(request)}`;
}

const IP_PATTERN = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f:]{2,39})$/i;

/**
 * Best-effort visitor address for anonymous rate limiting and audit hashing.
 * Cloudflare overwrites CF-Connecting-IP on every proxied request; when the
 * header is absent or malformed we fall back to Fastify's proxy-aware ip.
 */
export function clientIp(request: { ip: string; headers?: Record<string, string | string[] | undefined> }) {
  const header = request.headers?.['cf-connecting-ip'];
  const value = Array.isArray(header) ? header[0] : header;
  return value && IP_PATTERN.test(value.trim()) ? value.trim() : request.ip;
}

export function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export type GuildResources = {
  channels: Array<{ id: string; type: number }>;
  roles: Array<{ id: string }>;
};

// Channel types a log can be posted to: text, voice (text chat), announcement, stage (text chat).
const SENDABLE_CHANNEL_TYPES = new Set([0, 2, 5, 13]);

/**
 * Returns the first channel/role reference that does not belong to the guild,
 * or null when every reference is valid. Prevents an admin of one server from
 * pointing logs (or mentions) at objects of another server the bot can see.
 */
export function findForeignReference(
  resources: GuildResources,
  refs: { channelIds?: Array<string | null | undefined>; sendableChannelIds?: Array<string | null | undefined>; roleIds?: Array<string | null | undefined> }
): string | null {
  const channels = new Map(resources.channels.map((channel) => [channel.id, channel]));
  const roles = new Set(resources.roles.map((role) => role.id));
  for (const id of refs.sendableChannelIds ?? []) {
    if (!id) continue;
    const channel = channels.get(id);
    if (!channel || !SENDABLE_CHANNEL_TYPES.has(channel.type)) return id;
  }
  for (const id of refs.channelIds ?? []) {
    if (id && !channels.has(id)) return id;
  }
  for (const id of refs.roleIds ?? []) {
    if (id && !roles.has(id)) return id;
  }
  return null;
}

/**
 * Streams a JSON export without materialising every row (and its decrypted
 * details) in memory at once. The document shape is unchanged:
 * { exportedAt, guildId, count, events: [...] }.
 */
export async function* exportJsonChunks<T>(
  header: { exportedAt: string; guildId: string },
  pages: AsyncIterable<T[]>,
  map: (row: T) => unknown
): AsyncGenerator<string> {
  yield `{\n  "exportedAt": ${JSON.stringify(header.exportedAt)},\n  "guildId": ${JSON.stringify(header.guildId)},\n  "events": [`;
  let count = 0;
  for await (const page of pages) {
    for (const row of page) {
      yield `${count === 0 ? '\n' : ',\n'}    ${JSON.stringify(map(row))}`;
      count += 1;
    }
  }
  yield `${count ? '\n  ' : ''}],\n  "count": ${count}\n}\n`;
}
