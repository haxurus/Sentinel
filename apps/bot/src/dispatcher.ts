import { UnrecoverableError, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from '@sentinel/db';
import { eventDefinition } from '@sentinel/shared';
import { DiscordAPIError, EmbedBuilder, type Client } from 'discord.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { unprotectJson, redactText } from './security.js';
import { eventEmbedCopy, fieldLabel, normalizeEmbedLocale } from './embed-i18n.js';
import {
  asObject,
  buildDetailsField,
  fitEmbed,
  formatAttachmentList,
  formatReference,
  joinWithinLimit,
  normalizeColor,
  targetKindForEvent,
  toStringList,
  truncate,
  type EmbedField
} from './embed-format.js';

export const DISPATCH_ATTEMPTS = 4;

// Discord answers these permanently for the same request: retrying only burns
// rate limit and delays the next logs. 429 is handled inside discord.js.
const PERMANENT_DISCORD_STATUSES = new Set([400, 401, 403, 404]);

const targetLabel = (eventKey: string, locale: ReturnType<typeof normalizeEmbedLocale>) => {
  switch (targetKindForEvent(eventKey)) {
    case 'user': return fieldLabel('targetUser', locale);
    case 'role': return fieldLabel('targetRole', locale);
    case 'channel': return fieldLabel('targetChannel', locale);
    case 'guild': return fieldLabel('targetGuild', locale);
    default: return fieldLabel('target', locale);
  }
};

export function startDispatcher(client: Client) {
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  const worker = new Worker('discord-log-dispatch', async (job: Job) => {
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
    // A log must never leave the server it was produced in, even if a stale or
    // tampered route points to a channel of another guild the bot can see.
    if (!channel || channel.guildId !== guild.id || !channel.isSendable()) { await mark('CHANNEL_UNAVAILABLE'); return; }

    const embedLocale = normalizeEmbedLocale(event.guild.locale);
    const copy = eventEmbedCopy(event.eventKey, embedLocale, def?.label ?? event.eventKey, def?.description ?? event.summary);
    const description = embedLocale === 'it' ? event.summary : copy.description;

    const fields: EmbedField[] = [];
    if (event.actorId && route?.showActor !== false) {
      fields.push({ name: fieldLabel('actionAuthor', embedLocale), value: formatReference(guild, 'user', event.actorId), inline: true });
    }
    if (event.targetId && route?.showTarget !== false) {
      fields.push({ name: targetLabel(event.eventKey, embedLocale), value: formatReference(guild, targetKindForEvent(event.eventKey), event.targetId), inline: true });
    }
    if (event.channelId && route?.showChannel !== false) {
      fields.push({ name: fieldLabel('channel', embedLocale), value: formatReference(guild, 'channel', event.channelId), inline: true });
    }

    const content = typeof details.content === 'string' ? details.content : null;
    const oldContent = typeof details.oldContent === 'string' ? details.oldContent : null;
    const newContent = typeof details.newContent === 'string' ? details.newContent : null;
    if (route?.includeContent !== false) {
      if (content) fields.push({ name: fieldLabel('content', embedLocale), value: truncate(content, 1024) });
      if (oldContent !== null) fields.push({ name: fieldLabel('before', embedLocale), value: truncate(oldContent, 1024) || fieldLabel('empty', embedLocale) });
      if (newContent !== null) fields.push({ name: fieldLabel('after', embedLocale), value: truncate(newContent, 1024) || fieldLabel('empty', embedLocale) });
    }

    const attachments = Array.isArray(details.attachments) ? details.attachments as Array<Record<string, unknown>> : [];
    if (route?.includeAttachments !== false && attachments.length) {
      fields.push({
        name: `${fieldLabel('attachments', embedLocale)} (${attachments.length})`,
        value: joinWithinLimit(formatAttachmentList(attachments, embedLocale), 1024)
      });
    }

    const formattedDetails = buildDetailsField(guild, details, embedLocale);
    if (formattedDetails) fields.push({ name: fieldLabel('details', embedLocale), value: formattedDetails });

    const fitted = fitEmbed({
      title: route?.customTitle || copy.label,
      description,
      footer: route?.customFooter || event.guild.embedFooter,
      fields
    });

    const embed = new EmbedBuilder()
      .setTitle(fitted.title)
      .setColor(normalizeColor(route?.embedColor || event.guild.embedColor));
    if (fitted.description) embed.setDescription(fitted.description);
    if (fitted.footer) embed.setFooter({ text: fitted.footer });
    if (fitted.fields.length) embed.addFields(fitted.fields);
    if (route?.showTimestamp !== false) embed.setTimestamp(event.createdAt);
    if (route?.thumbnailUrl?.startsWith('https://')) embed.setThumbnail(route.thumbnailUrl);

    const mentionRoleIds = (route?.mentionRoleIds ?? []).filter((id) => guild.roles.cache.has(id));
    const mentions = mentionRoleIds.map((id) => `<@&${id}>`).join(' ');
    const prefix = route?.textPrefix?.trim() ?? '';
    const messageContent = truncate([mentions, prefix].filter(Boolean).join(' '), 2000);

    try {
      await channel.send({
        content: messageContent || undefined,
        embeds: [embed],
        allowedMentions: { parse: [], roles: mentionRoleIds, users: [], repliedUser: false }
      });
    } catch (error) {
      if (error instanceof DiscordAPIError && PERMANENT_DISCORD_STATUSES.has(error.status)) {
        throw new UnrecoverableError(`Discord rejected the log (${error.status} ${error.code}): ${error.message}`);
      }
      throw error;
    }
    await prisma.logEvent.update({ where: { id: event.id }, data: { dispatchState: 'SENT', dispatchError: null, dispatchedAt: new Date() } });
  }, { connection, concurrency: 5 });

  worker.on('failed', (job, error) => {
    const eventId = job?.data?.eventId ? String(job.data.eventId) : null;
    const message = redactText(error.message).slice(0, 1000);
    const final = error instanceof UnrecoverableError || error.name === 'UnrecoverableError' || !job || job.attemptsMade >= (job.opts.attempts ?? 1);
    logger.warn({ jobId: job?.id, eventId, attemptsMade: job?.attemptsMade, final, error: message }, 'Log dispatch failed');
    if (!eventId) return;
    // Intermediate failures keep the event PENDING so the dashboard does not
    // report a delivery problem that the next retry will resolve.
    void prisma.logEvent.update({
      where: { id: eventId },
      data: { dispatchState: final ? 'FAILED' : 'PENDING', dispatchError: message }
    }).catch(() => null);
  });

  worker.on('error', (error) => logger.error({ error: redactText(error.message) }, 'Dispatch worker error'));

  return worker;
}
