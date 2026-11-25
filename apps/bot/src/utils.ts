import type { Guild, GuildAuditLogsEntry } from 'discord.js';
import { AuditLogEvent, PermissionFlagsBits } from 'discord.js';
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
  // A Date has no own keys: walking it would store {} instead of the timestamp.
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
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

// Without View Audit Log every lookup is answered 403, and Discord restricts
// clients that keep sending invalid requests. BotAdd lookups skip this check:
// on join the bot's own role may not be cached yet, and the installer
// blacklist depends on that lookup.
const canViewAuditLog = (guild: Guild) => {
  const me = guild.members.me;
  return !me || me.partial || me.permissions.has(PermissionFlagsBits.ViewAuditLog);
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function findRecentAuditEntry(
  guild: Guild,
  type: AuditLogEvent,
  targetId?: string,
  maxAgeMs = 12_000,
  matches: (entry: GuildAuditLogsEntry) => boolean = () => true
): Promise<GuildAuditLogsEntry | null> {
  try {
    if (type !== AuditLogEvent.BotAdd && !canViewAuditLog(guild)) return null;
    await delay(700);
    const logs = await guild.fetchAuditLogs({ type, limit: 6 });
    const now = Date.now();
    const entry = logs.entries.find((candidate) => {
      // Invites are identified by code and soundboard sounds by soundId: only
      // the raw target ID (or the code) matches them.
      const target = candidate.target as { id?: string; code?: string } | null;
      const sameTarget = !targetId || [candidate.targetId, target?.id, target?.code].includes(targetId);
      return sameTarget && now - candidate.createdTimestamp <= maxAgeMs && matches(candidate);
    });
    return entry ?? null;
  } catch {
    return null;
  }
}

// Audit entry ID -> how many of its actions were already attributed.
const claimedAuditCounts = new Map<string, number>();

/**
 * Discord merges repeated voice disconnects/moves by the same moderator into
 * one entry and only raises its `extra.count`; the entry names no target. An
 * action is attributed when an entry is new or its count grew since the last
 * look, and each attribution consumes one unit of the count.
 *
 * shortcut: a voluntary leave racing a forced one in the same guild can take
 * the attribution, and an entry merged before a restart has no baseline (the
 * first action after a restart stays unattributed).
 */
export async function claimAggregatedAuditEntry(
  guild: Guild,
  type: AuditLogEvent.MemberDisconnect | AuditLogEvent.MemberMove,
  channelId?: string | null,
  maxAgeMs = 12_000
): Promise<GuildAuditLogsEntry | null> {
  if (!canViewAuditLog(guild)) return null;
  try {
    await delay(700);
    const logs = await guild.fetchAuditLogs({ type, limit: 6 });
    if (claimedAuditCounts.size > 10_000) claimedAuditCounts.clear();
    let claimed: GuildAuditLogsEntry | null = null;
    for (const entry of logs.entries.values()) {
      const extra = entry.extra as { count?: number; channel?: { id?: string } } | null;
      const count = Number(extra?.count ?? 1);
      const seen = claimedAuditCounts.get(entry.id);
      const fresh = seen === undefined && Date.now() - entry.createdTimestamp <= maxAgeMs;
      const baseline = seen ?? (fresh ? 0 : count);
      const sameChannel = !channelId || extra?.channel?.id === channelId;
      if (!claimed && sameChannel && count > baseline) {
        claimed = entry;
        claimedAuditCounts.set(entry.id, baseline + 1);
      } else if (seen === undefined) {
        claimedAuditCounts.set(entry.id, baseline);
      }
    }
    return claimed;
  } catch {
    return null;
  }
}
