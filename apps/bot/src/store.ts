import { prisma, type GuildSettings } from '@sentinel/db';
import { EVENT_CATALOG, effectiveTier, planLimits } from '@sentinel/shared';
import type { Guild, Message } from 'discord.js';
import { encryptText, protectJson } from './security.js';
import { logger } from './logger.js';

const cache = new Map<string, { value: GuildSettings; expires: number }>();

export async function ensureGuild(guild: Guild) {
  const settings = await prisma.guildSettings.upsert({
    where: { guildId: guild.id },
    update: { guildName: guild.name, iconUrl: guild.iconURL(), removedAt: null },
    create: { guildId: guild.id, guildName: guild.name, iconUrl: guild.iconURL() }
  });

  await prisma.logRoute.createMany({
    data: EVENT_CATALOG.map((event) => ({
      guildId: guild.id,
      eventKey: event.key,
      captureEnabled: !event.noisy,
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
      authorTag: encryptText(message.author.tag),
      authorBot: message.author.bot,
      content,
      attachments: protectJson(attachments),
      embeds: protectJson(embeds),
      roleIds,
      createdAt: message.createdAt
    }
  });
}

/**
 * Rows written before summaries and author names were encrypted. They expire
 * with the retention anyway; this encrypts them in small batches so that no
 * name stays in clear in the meantime.
 */
export async function encryptLegacyRows() {
  let total = 0;
  for (;;) {
    const events = await prisma.logEvent.findMany({ where: { NOT: { summary: { startsWith: 'enc:v1:' } } }, select: { id: true, summary: true }, take: 500 });
    const snapshots = await prisma.messageSnapshot.findMany({
      where: { authorTag: { not: null }, NOT: { authorTag: { startsWith: 'enc:v1:' } } },
      select: { messageId: true, authorTag: true },
      take: 500
    });
    if (!events.length && !snapshots.length) break;
    await prisma.$transaction([
      ...events.map((row) => prisma.logEvent.update({ where: { id: row.id }, data: { summary: encryptText(row.summary)! } })),
      ...snapshots.map((row) => prisma.messageSnapshot.update({ where: { messageId: row.messageId }, data: { authorTag: encryptText(row.authorTag) } }))
    ]);
    total += events.length + snapshots.length;
  }
  if (total) logger.info({ rows: total }, 'Encrypted legacy summaries and author names');
  return total;
}

/** Days a server's data is kept after the bot is removed from it. */
export const REMOVED_GUILD_GRACE_DAYS = 30;

/** The bot left or was removed: start the countdown to deleting its data. */
export async function markGuildRemoved(guildId: string) {
  cache.delete(guildId);
  await prisma.guildSettings.updateMany({ where: { guildId, removedAt: null }, data: { removedAt: new Date() } });
}

/**
 * Servers in the database that the bot no longer belongs to, for example
 * because it was removed while offline. `present` must be the full guild list
 * after login: unavailable guilds are part of it, so an outage never counts.
 */
export async function markMissingGuildsRemoved(present: Iterable<string>) {
  const ids = [...present];
  const result = await prisma.guildSettings.updateMany({
    where: { removedAt: null, guildId: { notIn: ids } },
    data: { removedAt: new Date() }
  });
  return result.count;
}

/**
 * Deletes every server removed more than the grace period ago. The cascade
 * removes its loggers, events, message snapshots, panel roles and panel log.
 * Blacklist entries are kept; a Discord subscription is restored from its
 * entitlement if the bot is added back.
 */
export async function purgeRemovedGuilds(now = new Date()) {
  const cutoff = new Date(now.getTime() - REMOVED_GUILD_GRACE_DAYS * 86_400_000);
  const rows = await prisma.guildSettings.findMany({ where: { removedAt: { lt: cutoff } }, select: { guildId: true } });
  for (const { guildId } of rows) {
    cache.delete(guildId);
    // Re-check the condition: the bot may have been added back meanwhile.
    await prisma.guildSettings.deleteMany({ where: { guildId, removedAt: { lt: cutoff } } });
  }
  return rows.map((row) => row.guildId);
}

export async function runRetentionCleanup() {
  const guilds = await prisma.guildSettings.findMany({
    select: { guildId: true, defaultRetentionDays: true, planTier: true, planExpiresAt: true }
  });

  for (const guild of guilds) {
    // The plan caps retention: after a downgrade older data goes away on the
    // next run even if the stored settings still ask for more.
    const maxDays = planLimits(effectiveTier(guild)).retentionDays;
    const defaultDays = Math.min(guild.defaultRetentionDays, maxDays);
    const routes = await prisma.logRoute.findMany({
      where: { guildId: guild.guildId, retentionDays: { not: null } },
      select: { eventKey: true, retentionDays: true }
    });
    const overriddenKeys = routes.map((route) => route.eventKey);
    const cutoff = new Date(Date.now() - defaultDays * 86_400_000);

    const deletions = routes.map((route) => prisma.logEvent.deleteMany({
      where: {
        guildId: guild.guildId,
        eventKey: route.eventKey,
        createdAt: { lt: new Date(Date.now() - Math.min(route.retentionDays ?? defaultDays, maxDays) * 86_400_000) }
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


export async function isUserInstallBlocked(userId: string) {
  const block = await prisma.installBlock.findUnique({
    where: { kind_subjectId: { kind: 'USER', subjectId: userId } },
    select: { id: true }
  });
  return Boolean(block);
}

