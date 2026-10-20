import { EmbedBuilder, type Client } from 'discord.js';
import { prisma } from '@sentinel/db';
import { sendStatusMessage } from './dispatcher.js';
import { truncate } from './embed-format.js';
import { logger } from './logger.js';
import type { AlertCategory, AlertSeverity } from '@sentinel/shared';
import { protectJson, redactText } from './security.js';

export type StatusLevel = 'info' | 'ok' | 'warn' | 'error';

export type StatusNotice = {
  level: StatusLevel;
  /** Decides where the API routes it (super console → Monitoring). */
  category: AlertCategory;
  /** critical: mention and reminders, ignores quiet hours; warning; info. */
  severity: AlertSeverity;
  title: string;
  description?: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  /** Notices sharing a key are sent at most once per DEDUPE_MS. */
  dedupeKey?: string;
};

export type StatusResult = { ok: true } | { ok: false; error: string };

export type StatusNotifier = {
  /** Sends straight to the status channel (the super console test button). */
  deliver: (notice: StatusNotice, options?: { force?: boolean }) => Promise<StatusResult>;
  /**
   * Fire-and-forget: records the notice; the API routes it to its channel,
   * groups repeats and applies quiet hours. Must never break the caller.
   */
  notify: (notice: StatusNotice) => void;
  /** Drops the cached target after the super console changes it. */
  invalidate: () => void;
};

const COLORS: Record<StatusLevel, number> = { info: 0xa78bfa, ok: 0x3ccf8e, warn: 0xf5a524, error: 0xf2555a };
const CONFIG_CACHE_MS = 60_000;
const DEDUPE_MS = 10 * 60_000;
// A crash loop or a flood of Gateway warnings must not flood the database;
// repeats that get through are merged by the API before reaching Discord.
const BURST_WINDOW_MS = 10 * 60_000;
const BURST_MAX = 120;

type Target = { guildId: string; channelId: string } | null;

export function createStatusNotifier(client: Client): StatusNotifier {
  let cached: { value: Target; expires: number } | null = null;
  const recent = new Map<string, number>();
  let windowStart = 0;
  let windowCount = 0;

  const target = async (): Promise<Target> => {
    if (cached && cached.expires > Date.now()) return cached.value;
    const row = await prisma.statusChannel.findUnique({ where: { id: 1 }, select: { guildId: true, channelId: true } });
    const value = row ? { guildId: row.guildId, channelId: row.channelId } : null;
    cached = { value, expires: Date.now() + CONFIG_CACHE_MS };
    return value;
  };

  const throttled = (notice: StatusNotice) => {
    const now = Date.now();
    if (notice.dedupeKey) {
      const last = recent.get(notice.dedupeKey);
      if (last && now - last < DEDUPE_MS) return true;
      recent.set(notice.dedupeKey, now);
    }
    if (recent.size > 500) {
      for (const [entry, at] of recent) if (now - at >= DEDUPE_MS) recent.delete(entry);
    }
    if (now - windowStart > BURST_WINDOW_MS) {
      windowStart = now;
      windowCount = 0;
    }
    windowCount += 1;
    return windowCount > BURST_MAX;
  };

  /**
   * Every notice also goes to the super console's event feed, even when no
   * status channel is set. createMany: the bot may insert but not read back.
   */
  const record = async (notice: StatusNotice) => {
    const description = notice.description ? redactText(notice.description).slice(0, 4000) : null;
    const fields = (notice.fields ?? []).filter((field) => field.value).slice(0, 20)
      .map((field) => ({ name: field.name.slice(0, 256), value: redactText(field.value).slice(0, 1024) }));
    await prisma.instanceEvent.createMany({
      data: [{ source: 'bot', level: notice.level, category: notice.category, severity: notice.severity, title: notice.title.slice(0, 256), details: protectJson({ description, fields }) }]
    }).catch((error: unknown) => logger.warn({ error: redactText(String(error)) }, 'Unable to record instance event'));
  };

  const deliver: StatusNotifier['deliver'] = async (notice, options = {}) => {
    if (!options.force && throttled(notice)) return { ok: false, error: 'THROTTLED' };
    let config: Target;
    try {
      config = await target();
    } catch {
      return { ok: false, error: 'STATUS_CONFIG_UNAVAILABLE' };
    }
    if (!config) return { ok: false, error: 'STATUS_CHANNEL_NOT_SET' };

    const embed = new EmbedBuilder()
      .setTitle(truncate(notice.title, 256))
      .setColor(COLORS[notice.level])
      .setFooter({ text: 'Sentinel · stato del bot' })
      .setTimestamp(new Date());
    if (notice.description) embed.setDescription(truncate(redactText(notice.description), 4000));
    const fields = (notice.fields ?? [])
      .filter((field) => field.value)
      .slice(0, 20)
      .map((field) => ({ name: truncate(field.name, 256), value: truncate(redactText(field.value), 1024), inline: field.inline ?? true }));
    if (fields.length) embed.addFields(fields);

    try {
      await sendStatusMessage(client, config.guildId, config.channelId, embed);
      return { ok: true };
    } catch (error) {
      const message = redactText(error instanceof Error ? error.message : String(error));
      logger.warn({ error: message }, 'Status notification failed');
      return { ok: false, error: message.slice(0, 200) };
    }
  };

  return {
    deliver,
    notify: (notice) => { if (!throttled(notice)) void record(notice).catch(() => null); },
    invalidate: () => { cached = null; }
  };
}
