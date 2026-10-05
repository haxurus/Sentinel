// Pure embed rendering helpers. Kept free of Discord client, database and
// secret-loading imports so they can be unit tested in isolation.
import {
  detailLabel,
  fieldLabel,
  overwriteActionLabel,
  permissionLabel,
  sourceLabel,
  yesNo,
  type EmbedLocale
} from './embed-i18n.js';

export type ReferenceGuild = {
  id: string;
  name: string;
  members: { cache: { get(id: string): { displayName?: string | null; user?: { username?: string | null } | null } | undefined } };
  roles: { cache: { get(id: string): { name: string } | undefined } };
  channels: { cache: { get(id: string): unknown } };
};

export type DiscordReferenceKind = 'user' | 'role' | 'channel' | 'guild' | 'technical';

export const truncate = (value: string | null | undefined, max = 1000) => {
  if (!value) return '';
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
};

export const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export const toStringList = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];

export const normalizeColor = (value?: string | null) => {
  const fallback = 0x3f3c54;
  if (!value || !/^#?[0-9a-f]{6}$/i.test(value)) return fallback;
  return Number.parseInt(value.replace('#', ''), 16);
};

const USER_TARGET_EVENTS = new Set([
  'member.join', 'member.leave', 'member.update', 'moderation.kick', 'moderation.ban', 'moderation.unban',
  'voice.join', 'voice.leave', 'voice.move', 'voice.state', 'thread.member_update', 'user.update',
  'presence.update', 'typing.start', 'message.delete'
]);

const CHANNEL_TARGET_EVENTS = new Set([
  'channel.create', 'channel.update', 'channel.delete', 'channel.pins',
  'thread.create', 'thread.update', 'thread.delete', 'thread.members_update'
]);

const GUILD_TARGET_EVENTS = new Set([
  'guild.update', 'guild.available', 'guild.unavailable', 'guild.remove', 'voice.server_update',
  'integration.update', 'thread.list_sync', 'soundboard.sync'
]);

export const referenceKindForDetail = (key: string): DiscordReferenceKind | null => {
  const lower = key.toLowerCase();

  if (
    lower === 'roles' ||
    lower === 'addedroles' ||
    lower === 'removedroles' ||
    /roleids?$/.test(lower)
  ) return 'role';

  if (
    lower === 'addeduserids' ||
    lower === 'removeduserids' ||
    lower === 'botuserid' ||
    /(?:user|member|author|owner|inviter|executor)ids?$/.test(lower)
  ) return 'user';

  if (/(?:channel|parent)ids?$/.test(lower)) return 'channel';
  if (/guildids?$/.test(lower)) return 'guild';
  return null;
};

export const targetKindForEvent = (eventKey: string): DiscordReferenceKind => {
  if (USER_TARGET_EVENTS.has(eventKey)) return 'user';
  if (eventKey.startsWith('role.')) return 'role';
  if (CHANNEL_TARGET_EVENTS.has(eventKey)) return 'channel';
  if (GUILD_TARGET_EVENTS.has(eventKey)) return 'guild';
  return 'technical';
};

export const looksLikeSnowflake = (value: string) => /^\d{17,20}$/.test(value);

// Prevent user-controlled names from breaking embed markdown.
export const escapeMarkdown = (value: string) => value.replace(/([\\`*_~|>\[\]()])/g, '\\$1');

export const formatReference = (guild: ReferenceGuild, kind: DiscordReferenceKind, id: string) => {
  if (!looksLikeSnowflake(id)) return `\`${id.replace(/`/g, "'")}\``;

  switch (kind) {
    case 'user': {
      const cached = guild.members.cache.get(id);
      const name = cached?.displayName || cached?.user?.username;
      return `${name ? `**${escapeMarkdown(name)}** · ` : ''}<@${id}> · \`${id}\``;
    }
    case 'role': {
      const role = guild.roles.cache.get(id);
      return `${role ? `**@${escapeMarkdown(role.name)}** · ` : ''}<@&${id}> · \`${id}\``;
    }
    case 'channel': {
      const channel = guild.channels.cache.get(id) as { name?: string } | undefined;
      const name = channel && typeof channel.name === 'string' ? channel.name : null;
      return `${name ? `**#${escapeMarkdown(name)}** · ` : ''}<#${id}> · \`${id}\``;
    }
    case 'guild':
      return id === guild.id ? `**${escapeMarkdown(guild.name)}** · \`${id}\`` : `\`${id}\``;
    default:
      return `\`${id}\``;
  }
};

const formatPermissionOverwriteChanges = (guild: ReferenceGuild, value: unknown, locale: EmbedLocale) => {
  if (!Array.isArray(value) || !value.length) return '—';

  const lines = value.slice(0, 8).map((item) => {
    const change = asObject(item);
    const targetId = String(change.targetId ?? '');
    const targetKind: DiscordReferenceKind = change.targetType === 'user' ? 'user' : 'role';
    const target = formatReference(guild, targetKind, targetId);
    const action = overwriteActionLabel(change.action, locale);

    const parts: string[] = [];
    const pushPermissions = (label: string, permissions: unknown) => {
      if (!Array.isArray(permissions) || !permissions.length) return;
      parts.push(`${label}: ${permissions.map((permission) => permissionLabel(String(permission), locale)).join(', ')}`);
    };

    pushPermissions(fieldLabel('allowAdd', locale), change.allowAdded);
    pushPermissions(fieldLabel('allowRemove', locale), change.allowRemoved);
    pushPermissions(fieldLabel('denyAdd', locale), change.denyAdded);
    pushPermissions(fieldLabel('denyRemove', locale), change.denyRemoved);

    return `${target} — **${action}**${parts.length ? ` — ${parts.join(' · ')}` : ''}`;
  });
  if (value.length > 8) lines.push(`… +${value.length - 8}`);
  return lines.join('\n');
};

const PERMISSION_LIST_KEYS = new Set(['addedPermissions', 'removedPermissions']);

const formatPrimitive = (guild: ReferenceGuild, key: string, value: string | number | boolean, locale: EmbedLocale) => {
  if (typeof value === 'boolean') return yesNo(value, locale);
  if (typeof value === 'number') return String(value);

  const kind = referenceKindForDetail(key);
  if (kind && looksLikeSnowflake(value)) return formatReference(guild, kind, value);

  if (key === 'source') return sourceLabel(value, locale);
  if (PERMISSION_LIST_KEYS.has(key)) return permissionLabel(value, locale);

  if (/At$/.test(key) && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const timestamp = Math.floor(new Date(value).getTime() / 1000);
    if (Number.isFinite(timestamp)) return `<t:${timestamp}:F>`;
  }

  const safe = value.replace(/`/g, "'");
  return `\`${safe.length > 180 ? truncate(safe, 176) : safe}\``;
};

export const formatDetailValue = (guild: ReferenceGuild, key: string, value: unknown, locale: EmbedLocale, depth = 0): string => {
  if (value === null || value === undefined) return '—';
  if (key === 'permissionOverwriteChanges') return formatPermissionOverwriteChanges(guild, value, locale);

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return formatPrimitive(guild, key, value, locale);
  }

  if (Array.isArray(value)) {
    if (!value.length) return fieldLabel('none', locale);

    const kind = referenceKindForDetail(key);
    const items = value.slice(0, 10).map((item) => {
      if (kind && (typeof item === 'string' || typeof item === 'number')) {
        return formatReference(guild, kind, String(item));
      }
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
        return formatPrimitive(guild, key, item, locale);
      }
      return formatDetailValue(guild, key, item, locale, depth + 1);
    });
    if (value.length > 10) items.push(`… +${value.length - 10}`);
    return items.join(', ');
  }

  if (typeof value === 'object') {
    if (depth >= 2) {
      const raw = JSON.stringify(value).replace(/`/g, "'");
      return `\`${truncate(raw, 280)}\``;
    }

    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined && nested !== null)
      .slice(0, 8);

    if (!entries.length) return '—';

    const rendered = entries.map(([nestedKey, nestedValue]) =>
      `${detailLabel(nestedKey, locale)}: ${formatDetailValue(guild, nestedKey, nestedValue, locale, depth + 1)}`
    );
    const extra = Object.keys(value as Record<string, unknown>).length - entries.length;
    if (extra > 0) rendered.push(`… +${extra}`);
    return rendered.join(' · ');
  }

  return `\`${String(value)}\``;
};

const IGNORED_DETAIL_KEYS = new Set(['content', 'oldContent', 'newContent', 'attachments', 'actorRoleIds', 'actorBot']);

export const buildDetailsField = (guild: ReferenceGuild, details: Record<string, unknown>, locale: EmbedLocale) => {
  const lines = Object.entries(details)
    .filter(([key, value]) => !IGNORED_DETAIL_KEYS.has(key) && value !== undefined && value !== null)
    .map(([key, value]) => `**${detailLabel(key, locale)}:** ${formatDetailValue(guild, key, value, locale)}`);

  if (!lines.length) return null;

  let result = '';
  for (const line of lines) {
    const candidate = result ? `${result}\n${line}` : line;
    if (candidate.length <= 1024) {
      result = candidate;
      continue;
    }

    if (!result) result = truncate(line, 1024);
    else if (result.length <= 1022) result += '\n…';
    break;
  }
  return result || null;
};

export const formatAttachmentList = (attachments: Array<Record<string, unknown>>, locale: EmbedLocale) =>
  attachments.slice(0, 10).map((attachment) => {
    const name = escapeMarkdown(String(attachment.name ?? fieldLabel('file', locale)).slice(0, 100));
    const url = String(attachment.url ?? '');
    return /^https:\/\//.test(url) ? `[${name}](${url.replace(/\)/g, '%29')})` : name;
  });

export const joinWithinLimit = (lines: string[], max: number) => {
  let result = '';
  for (const line of lines) {
    const candidate = result ? `${result}\n${line}` : line;
    if (candidate.length > max) break;
    result = candidate;
  }
  return result || truncate(lines[0] ?? '', max);
};

export type EmbedField = { name: string; value: string; inline?: boolean };
export type EmbedData = { title: string; description: string; footer: string | null; fields: EmbedField[] };

export const EMBED_LIMITS = { title: 256, description: 4096, fieldName: 256, fieldValue: 1024, fields: 25, footer: 2048, total: 6000 } as const;

const embedLength = (embed: EmbedData) =>
  embed.title.length + embed.description.length + (embed.footer?.length ?? 0) +
  embed.fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);

/**
 * Enforce Discord's embed limits so an oversized log is shortened instead of
 * being rejected (and retried) by the API.
 */
export const fitEmbed = (input: EmbedData): EmbedData => {
  const embed: EmbedData = {
    title: truncate(input.title.trim() || 'Sentinel', EMBED_LIMITS.title),
    description: truncate(input.description, EMBED_LIMITS.description),
    footer: input.footer?.trim() ? truncate(input.footer.trim(), EMBED_LIMITS.footer) : null,
    fields: input.fields
      .filter((field) => field.name.trim())
      .slice(0, EMBED_LIMITS.fields)
      .map((field) => ({
        ...field,
        name: truncate(field.name, EMBED_LIMITS.fieldName),
        value: truncate(field.value, EMBED_LIMITS.fieldValue) || '—'
      }))
  };

  let excess = embedLength(embed) - EMBED_LIMITS.total;
  while (excess > 0) {
    const candidates: Array<{ length: number; shrink: (size: number) => void }> = [
      { length: embed.description.length, shrink: (size) => { embed.description = truncate(embed.description, size); } },
      ...embed.fields.map((field) => ({ length: field.value.length, shrink: (size: number) => { field.value = truncate(field.value, size) || '—'; } }))
    ];
    const largest = candidates.sort((a, b) => b.length - a.length)[0];
    if (!largest || largest.length <= 32) {
      if (!embed.fields.length) break;
      embed.fields = embed.fields.slice(0, -1);
    } else {
      largest.shrink(Math.max(32, largest.length - excess));
    }
    excess = embedLength(embed) - EMBED_LIMITS.total;
  }
  return embed;
};
