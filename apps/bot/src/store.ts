import { prisma, type GuildSettings } from '@sentinel/db';
import { EVENT_CATALOG } from '@sentinel/shared';
import type { Guild, Message } from 'discord.js';
import { encryptText, protectJson } from './security.js';

const cache = new Map<string, { value: GuildSettings; expires: number }>();

export async function ensureGuild(guild: Guild) {
  const settings = await prisma.guildSettings.upsert({
    where: { guildId: guild.id },
    update: { guildName: guild.name, iconUrl: guild.iconURL() },
    create: { guildId: guild.id, guildName: guild.name, iconUrl: guild.iconURL() }
  });

  await prisma.logRoute.createMany({
    data: EVENT_CATALOG.map((event) => ({
      guildId: guild.id,
      eventKey: event.key,
      enabled: !event.noisy
    })),
    skipDuplicates: true
  });

  cache.set(guild.id, { value: settings, expires: Date.now() + 30_000 });
  return settings;
}

export async function getGuildSettings(guildId: string) {
  const cached = cache.get(guildId);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = await prisma.guildSettings.findUnique({ where: { guildId } });
  if (value) cache.set(guildId, { value, expires: Date.now() + 30_000 });
  return value;
}

export async function snapshotMessage(message: Message) {
  if (!message.guildId || !message.author) return;
  const settings = await getGuildSettings(message.guildId);
  if (!settings?.messageSnapshotEnabled) return;

  const content = settings.storeMessageContent ? encryptText(message.content || null) : null;
  const attachments = [...message.attachments.values()].map((a) => ({
    id: a.id,
    name: a.name,
    url: a.url,
    proxyURL: a.proxyURL,
    contentType: a.contentType,
    size: a.size
  }));
  const embeds = settings.storeMessageContent ? message.embeds.map((e) => e.toJSON()) : [];
  const roleIds = message.member ? [...message.member.roles.cache.keys()] : [];

  await prisma.messageSnapshot.upsert({
    where: { messageId: message.id },
    update: { content, attachments: protectJson(attachments), embeds: protectJson(embeds), roleIds },
    create: {
      messageId: message.id,
      guildId: message.guildId,
      channelId: message.channelId,
      authorId: message.author.id,
      authorTag: message.author.tag,
      authorBot: message.author.bot,
      content,
      attachments: protectJson(attachments),
      embeds: protectJson(embeds),
      roleIds,
      createdAt: message.createdAt
    }
  });
}

export async function runRetentionCleanup() {
  const guilds = await prisma.guildSettings.findMany({
    select: { guildId: true, defaultRetentionDays: true }
  });

  for (const guild of guilds) {
    const routes = await prisma.logRoute.findMany({
      where: { guildId: guild.guildId, retentionDays: { not: null } },
      select: { eventKey: true, retentionDays: true }
    });
    const overriddenKeys = routes.map((route) => route.eventKey);
    const cutoff = new Date(Date.now() - guild.defaultRetentionDays * 86_400_000);

    const deletions = routes.map((route) => prisma.logEvent.deleteMany({
      where: {
        guildId: guild.guildId,
        eventKey: route.eventKey,
        createdAt: { lt: new Date(Date.now() - (route.retentionDays ?? guild.defaultRetentionDays) * 86_400_000) }
      }
    }));

    await prisma.$transaction([
      ...deletions,
      prisma.logEvent.deleteMany({
        where: {
          guildId: guild.guildId,
          ...(overriddenKeys.length ? { eventKey: { notIn: overriddenKeys } } : {}),
          createdAt: { lt: cutoff }
        }
      }),
      prisma.messageSnapshot.deleteMany({ where: { guildId: guild.guildId, createdAt: { lt: cutoff } } })
    ]);
  }
}


export async function isGuildInstallBlocked(guildId: string) {
  const block = await prisma.installBlock.findUnique({
    where: { kind_subjectId: { kind: 'GUILD', subjectId: guildId } },
    select: { id: true }
  });
  return Boolean(block);
}
