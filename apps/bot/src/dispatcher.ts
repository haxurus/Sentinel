import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '@sentinel/db';
import { eventDefinition } from '@sentinel/shared';
import { EmbedBuilder, type Client } from 'discord.js';
import { config } from './config.js';
import { truncate } from './utils.js';
import { unprotectJson, redactText } from './security.js';

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const toStringList = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];

const normalizeColor = (value?: string | null) => {
  const fallback = 0x3f3c54;
  if (!value) return fallback;
  const parsed = Number.parseInt(value.replace('#', ''), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function startDispatcher(client: Client) {
  const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
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

    const def = eventDefinition(event.eventKey);
    const embed = new EmbedBuilder()
      .setTitle(route?.customTitle || def?.label || event.eventKey)
      .setDescription(truncate(event.summary, 4000))
      .setColor(normalizeColor(route?.embedColor || event.guild.embedColor))
      .setFooter({ text: route?.customFooter || event.guild.embedFooter });

    if (route?.showTimestamp !== false) embed.setTimestamp(event.createdAt);
    if (route?.thumbnailUrl) embed.setThumbnail(route.thumbnailUrl);
    if (event.actorId && route?.showActor !== false) embed.addFields({ name: 'Autore azione', value: `<@${event.actorId}> (\`${event.actorId}\`)`, inline: true });
    if (event.targetId && route?.showTarget !== false) embed.addFields({ name: 'Target ID', value: `\`${event.targetId}\``, inline: true });
    if (event.channelId && route?.showChannel !== false) embed.addFields({ name: 'Canale', value: `<#${event.channelId}> (\`${event.channelId}\`)`, inline: true });

    const content = typeof details.content === 'string' ? details.content : null;
    const oldContent = typeof details.oldContent === 'string' ? details.oldContent : null;
    const newContent = typeof details.newContent === 'string' ? details.newContent : null;
    if (route?.includeContent !== false) {
      if (content) embed.addFields({ name: 'Contenuto', value: truncate(content, 1024) || '*vuoto*' });
      if (oldContent !== null) embed.addFields({ name: 'Prima', value: truncate(oldContent, 1024) || '*vuoto*' });
      if (newContent !== null) embed.addFields({ name: 'Dopo', value: truncate(newContent, 1024) || '*vuoto*' });
    }

    const attachments = Array.isArray(details.attachments) ? details.attachments as Array<Record<string, unknown>> : [];
    if (route?.includeAttachments !== false && attachments.length) {
      const list = attachments.slice(0, 10).map((a) => `[${String(a.name ?? 'file')}](${String(a.url ?? '')})`).join('\n');
      embed.addFields({ name: `Allegati (${attachments.length})`, value: truncate(list, 1024) });
    }

    const ignoredDetailKeys = new Set(['content', 'oldContent', 'newContent', 'attachments', 'actorRoleIds', 'actorBot']);
    const compact = Object.fromEntries(Object.entries(details).filter(([key, value]) => !ignoredDetailKeys.has(key) && value !== undefined && value !== null));
    if (Object.keys(compact).length) {
      embed.addFields({ name: 'Dettagli', value: `\`\`\`json\n${truncate(JSON.stringify(compact, null, 2), 930)}\n\`\`\`` });
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
