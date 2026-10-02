import type { Guild, GuildAuditLogsEntry } from 'discord.js';
import { AuditLogEvent } from 'discord.js';
import { redactText } from './security.js';

export const jsonSafe = <T>(value: T): T => JSON.parse(JSON.stringify(value, (_key, current) => {
  if (typeof current === 'bigint') return current.toString();
  return current;
}));


const SECRET_KEYS = new Set([
  'token', 'access_token', 'refresh_token', 'authorization', 'client_secret',
  'password', 'secret', 'session_id', 'webhook_token'
]);

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (typeof value === 'string') return redactText(value);
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    result[key] = SECRET_KEYS.has(normalized) || normalized.endsWith('_token')
      ? '[REDACTED]'
      : redactSecrets(item);
  }
  return result;
}

export const truncate = (value: string | null | undefined, max = 1000) => {
  if (!value) return '';
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function findRecentAuditEntry(
  guild: Guild,
  type: AuditLogEvent,
  targetId?: string,
  maxAgeMs = 12_000
): Promise<GuildAuditLogsEntry | null> {
  try {
    await delay(700);
    const logs = await guild.fetchAuditLogs({ type, limit: 6 });
    const now = Date.now();
    const entry = logs.entries.find((candidate) => {
      const target = candidate.target as { id?: string } | null;
      const sameTarget = !targetId || target?.id === targetId;
      return sameTarget && now - candidate.createdTimestamp <= maxAgeMs;
    });
    return entry ?? null;
  } catch {
    return null;
  }
}
