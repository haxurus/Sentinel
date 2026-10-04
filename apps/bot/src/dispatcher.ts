import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from '@sentinel/db';
import { eventDefinition } from '@sentinel/shared';
import { EmbedBuilder, type Client, type Guild } from 'discord.js';
import { config } from './config.js';
import { truncate } from './utils.js';
import { unprotectJson, redactText } from './security.js';
import {
  detailLabel,
  eventEmbedCopy,
  fieldLabel,
  normalizeEmbedLocale,
  overwriteActionLabel,
  permissionLabel,
  sourceLabel,
  yesNo,
  type EmbedLocale
} from './embed-i18n.js';

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const toStringList = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];

const normalizeColor = (value?: string | null) => {
  const fallback = 0x3f3c54;
  if (!value) return fallback;
  const parsed = Number.parseInt(value.replace('#', ''), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
};

type DiscordReferenceKind = 'user' | 'role' | 'channel' | 'guild' | 'technical';

const USER_TARGET_EVENTS = new Set([
  'member.join',
  'member.leave',
  'member.update',
  'moderation.kick',
  'moderation.ban',
  'moderation.unban',
  'voice.join',
  'voice.leave',
  'voice.move',
  'voice.state',
  'thread.member_update',
  'user.update',
  'presence.update',
  'typing.start'
]);

const ROLE_TARGET_PREFIXES = ['role.'];
const CHANNEL_TARGET_EVENTS = new Set([
  'channel.create',
  'channel.update',
  'channel.delete',
  'thread.create',
  'thread.update',
  'thread.delete',
  'thread.members_update'
]);

const humanizeDetailKey = (key: string, locale: EmbedLocale) => detailLabel(key, locale);

const referenceKindForDetail = (key: string): DiscordReferenceKind | null => {
  const lower = key.toLowerCase();

  if (
    lower === 'roles' ||
    lower === 'addedroles' ||
    lower === 'removedroles' ||
    /(?:^|_)(?:role)(?:id|ids)$/.test(lower) ||
    /roleids?$/.test(lower)
  ) return 'role';

  if (
    lower === 'addeduserids' ||
    lower === 'removeduserids' ||
    lower === 'botuserid' ||
    /(?:user|member|author|owner|inviter|executor)ids?$/.test(lower)
  ) return 'user';

  if (
    /(?:channel|parent)ids?$/.test(lower) ||
    lower === 'fromchannelid' ||
    lower === 'tochannelid'
  ) return 'channel';

  if (/guildids?$/.test(lower)) return 'guild';
  return null;
};

const targetKindForEvent = (eventKey: string): DiscordReferenceKind => {
  if (USER_TARGET_EVENTS.has(eventKey)) return 'user';
  if (ROLE_TARGET_PREFIXES.some((prefix) => eventKey.startsWith(prefix))) return 'role';
  if (CHANNEL_TARGET_EVENTS.has(eventKey)) return 'channel';
  if (eventKey === 'guild.update' || eventKey === 'guild.available' || eventKey === 'guild.unavailable' || eventKey === 'guild.remove' || eventKey === 'voice.server_update') return 'guild';
  return 'technical';
};

const looksLikeSnowflake = (value: string) => /^\d{17,20}$/.test(value);

const formatReference = (guild: Guild, kind: DiscordReferenceKind, id: string) => {
  if (!looksLikeSnowflake(id)) return `\`${id}\``;

  switch (kind) {
    case 'user': {
      const cached = guild.members.cache.get(id);
      const name = cached?.displayName || cached?.user?.username;
      return `${name ? `**${name}** · ` : ''}<@${id}> · \`${id}\``;
    }
    case 'role': {
      const role = guild.roles.cache.get(id);
      return `${role ? `**@${role.name}** · ` : ''}<@&${id}> · \`${id}\``;
    }
    case 'channel': {
      const channel = guild.channels.cache.get(id);
      const name = channel && 'name' in channel ? channel.name : null;
      return `${name ? `**#${name}** · ` : ''}<#${id}> · \`${id}\``;
    }
    case 'guild':
      return id === guild.id ? `**${guild.name}** · \`${id}\`` : `\`${id}\``;
    default:
      return `\`${id}\``;
  }
};

const formatPermissionOverwriteChanges = (guild: Guild, value: unknown, locale: EmbedLocale) => {
  if (!Array.isArray(value) || !value.length) return '—';

  return value.slice(0, 8).map((item) => {
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
  }).join('\n');
};

const formatPrimitive = (guild: Guild, key: string, value: string | number | boolean, locale: EmbedLocale) => {
  if (typeof value === 'boolean') return yesNo(value, locale);
  if (typeof value === 'number') return String(value);

  const kind = referenceKindForDetail(key);
  if (kind && looksLikeSnowflake(value)) return formatReference(guild, kind, value);

  if (key === 'source') return sourceLabel(value, locale);

  if (/At$/.test(key) && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const timestamp = Math.floor(new Date(value).getTime() / 1000);
    if (Number.isFinite(timestamp)) return `<t:${timestamp}:F>`;
  }

  return value.length > 180 ? `\`${truncate(value.replace(/\`/g, "'"), 176)}\`` : `\`${value.replace(/\`/g, "'")}\``;
};

const formatDetailValue = (guild: Guild, key: string, value: unknown, locale: EmbedLocale, depth = 0): string => {
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
      const raw = JSON.stringify(value).replace(/\`/g, "'");
      return `\`${truncate(raw, 280)}\``;
    }

    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined && nested !== null)
      .slice(0, 8);

    if (!entries.length) return '—';

    const rendered = entries.map(([nestedKey, nestedValue]) =>
      `${humanizeDetailKey(nestedKey, locale)}: ${formatDetailValue(guild, nestedKey, nestedValue, locale, depth + 1)}`
    );
    const extra = Object.keys(value as Record<string, unknown>).length - entries.length;
    if (extra > 0) rendered.push(`… +${extra}`);
    return rendered.join(' · ');
  }

  return `\`${String(value)}\``;
};

const buildDetailsField = (guild: Guild, details: Record<string, unknown>, locale: EmbedLocale) => {
  const ignoredDetailKeys = new Set(['content', 'oldContent', 'newContent', 'attachments', 'actorRoleIds', 'actorBot']);
  const lines = Object.entries(details)
    .filter(([key, value]) => !ignoredDetailKeys.has(key) && value !== undefined && value !== null)
    .map(([key, value]) => `**${humanizeDetailKey(key, locale)}:** ${formatDetailValue(guild, key, value, locale)}`);

  if (!lines.length) return null;

  let result = '';
  for (const line of lines) {
    const candidate = result ? `${result}\n${line}` : line;
    if (candidate.length <= 1024) {
      result = candidate;
      continue;
    }

    if (!result) result = truncate(line, 1021) + '…';
    else if (result.length <= 1018) result += '\n…';
    break;
  }
  return result || null;
};

export function startDispatcher(client: Client) {
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  const worker = new Worker('discord-log-dispatch', async (job) => {
    const event = await prisma.logEvent.findUnique({
      where: { id: String(job.data.eventId) },
      include: { guild: true }
    });
    if (!event) return;
    const mark = (dispatchState: string, dispatchError: string | null = null) => prisma.logEvent.update({ where: { id: event.id }, data: { dispatchState, dispatchError } }).catch(() => null);

    const route = await prisma.logRoute.findUnique({
      where: { guildId_eventKey: { guildId: event.guildId, eventKey: event.eventKey } }
    });
    if (route && !route.enabled) { await mark('DISABLED'); return; }

    const def = eventDefinition(event.eventKey);
    if (def?.noisy && !event.guild.premiumEnabled) {
      await mark('PREMIUM_REQUIRED');
      return;
    }

    const details = asObject(unprotectJson(event.details));
    const actorRoleIds = toStringList(details.actorRoleIds);
    if (route?.ignoreBots && details.actorBot === true) { await mark('FILTERED'); return; }
    if (event.actorId && route?.ignoredUserIds.includes(event.actorId)) { await mark('FILTERED'); return; }
    if (event.targetId && route?.ignoredUserIds.includes(event.targetId)) { await mark('FILTERED'); return; }
    if (event.channelId && route?.ignoredChannelIds.includes(event.channelId)) { await mark('FILTERED'); return; }
    if (route?.ignoredRoleIds.some((roleId) => actorRoleIds.includes(roleId))) { await mark('FILTERED'); return; }

    const destinationId = route?.destinationChannelId ?? event.guild.defaultLogChannelId;
    if (!destinationId) { await mark('NO_DESTINATION'); return; }

    const guild = client.guilds.cache.get(event.guildId);
    if (!guild) { await mark('GUILD_UNAVAILABLE'); return; }
    const channel = await guild.channels.fetch(destinationId).catch(() => null);
    if (!channel?.isSendable()) { await mark('CHANNEL_UNAVAILABLE'); return; }

    const embedLocale = normalizeEmbedLocale(event.guild.locale);
    const copy = eventEmbedCopy(
      event.eventKey,
      embedLocale,
      def?.label ?? event.eventKey,
      def?.description ?? event.summary
    );
    const description = embedLocale === 'it' ? event.summary : copy.description;

    const embed = new EmbedBuilder()
      .setTitle(route?.customTitle || copy.label)
      .setDescription(truncate(description, 4000))
      .setColor(normalizeColor(route?.embedColor || event.guild.embedColor))
      .setFooter({ text: route?.customFooter || event.guild.embedFooter });

    if (route?.showTimestamp !== false) embed.setTimestamp(event.createdAt);
    if (route?.thumbnailUrl) embed.setThumbnail(route.thumbnailUrl);
    if (event.actorId && route?.showActor !== false) {
      embed.addFields({ name: fieldLabel('actionAuthor', embedLocale), value: formatReference(guild, 'user', event.actorId), inline: true });
    }
    if (event.targetId && route?.showTarget !== false) {
      const targetKind = targetKindForEvent(event.eventKey);
      const targetLabel = targetKind === 'user'
        ? fieldLabel('targetUser', embedLocale)
        : targetKind === 'role'
          ? fieldLabel('targetRole', embedLocale)
          : targetKind === 'channel'
            ? fieldLabel('targetChannel', embedLocale)
            : targetKind === 'guild'
              ? fieldLabel('targetGuild', embedLocale)
              : fieldLabel('target', embedLocale);
      embed.addFields({ name: targetLabel, value: formatReference(guild, targetKind, event.targetId), inline: true });
    }
    if (event.channelId && route?.showChannel !== false) {
      embed.addFields({ name: fieldLabel('channel', embedLocale), value: formatReference(guild, 'channel', event.channelId), inline: true });
    }

    const content = typeof details.content === 'string' ? details.content : null;
    const oldContent = typeof details.oldContent === 'string' ? details.oldContent : null;
    const newContent = typeof details.newContent === 'string' ? details.newContent : null;
    if (route?.includeContent !== false) {
      if (content) embed.addFields({ name: fieldLabel('content', embedLocale), value: truncate(content, 1024) || fieldLabel('empty', embedLocale) });
      if (oldContent !== null) embed.addFields({ name: fieldLabel('before', embedLocale), value: truncate(oldContent, 1024) || fieldLabel('empty', embedLocale) });
      if (newContent !== null) embed.addFields({ name: fieldLabel('after', embedLocale), value: truncate(newContent, 1024) || fieldLabel('empty', embedLocale) });
    }

    const attachments = Array.isArray(details.attachments) ? details.attachments as Array<Record<string, unknown>> : [];
    if (route?.includeAttachments !== false && attachments.length) {
      const list = attachments.slice(0, 10).map((a) => `[${String(a.name ?? fieldLabel('file', embedLocale))}](${String(a.url ?? '')})`).join('\n');
      embed.addFields({ name: `${fieldLabel('attachments', embedLocale)} (${attachments.length})`, value: truncate(list, 1024) });
    }

    const formattedDetails = buildDetailsField(guild, details, embedLocale);
    if (formattedDetails) {
      embed.addFields({ name: fieldLabel('details', embedLocale), value: formattedDetails });
    }

    const mentions = route?.mentionRoleIds.map((id) => `<@&${id}>`).join(' ') ?? '';
    const prefix = route?.textPrefix?.trim() ?? '';
    const messageContent = truncate([mentions, prefix].filter(Boolean).join(' '), 2000);
    await channel.send({
      content: messageContent || undefined,
      embeds: [embed],
      allowedMentions: { roles: route?.mentionRoleIds ?? [], users: [], repliedUser: false }
    });
    await prisma.logEvent.update({ where: { id: event.id }, data: { dispatchState: 'SENT', dispatchError: null, dispatchedAt: new Date() } });
  }, { connection, concurrency: 5 });

  worker.on('failed', (job, error) => {
    console.error('Log dispatch failed', job?.id, redactText(error.message));
    const eventId = job?.data?.eventId ? String(job.data.eventId) : null;
    if (eventId) {
      void prisma.logEvent.update({
        where: { id: eventId },
        data: { dispatchState: 'FAILED', dispatchError: redactText(error.message).slice(0, 1000) }
      }).catch(() => null);
    }
  });

  return worker;
}
