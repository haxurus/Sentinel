import { ChannelType, EmbedBuilder, PermissionFlagsBits, type Guild, type TextChannel } from 'discord.js';
import { config } from './config.js';
import { logger } from './logger.js';

/**
 * One-time onboarding when Sentinel is added to a server: a message in the
 * server and a direct message to its owner, with the setup steps, the privacy
 * policy and the support contact. Nothing else is ever sent by DM (Discord
 * Developer Policy: messages must relate to the app's functionality).
 */

const ACCENT = 0xa78bfa;
const NEEDED = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];

type Locale = 'en' | 'it';

const copy = {
  en: {
    title: 'Thanks for adding Sentinel',
    intro: 'Sentinel records what happens on this server and posts it to the log channels you choose. It is read-only: it never bans, kicks or deletes anything.',
    stepsTitle: 'Set it up in a few minutes',
    steps: (web: string, guildId: string) => [
      `1. Open the [dashboard](${web}/en/dashboard/${guildId}) and sign in with Discord.`,
      '2. Choose a **default log channel**: Sentinel needs *View Channel*, *Send Messages* and *Embed Links* there.',
      '3. Turn on the **loggers** you need. Everything is configured from the dashboard, there are no commands.'
    ].join('\n'),
    guide: 'Guide',
    privacy: 'Privacy and terms',
    support: 'Support',
    links: (web: string, support: string) => `[Getting started](${web}/en/getting-started) · [Privacy policy and terms](${web}/en/legal) · [Support server](${support})`,
    ownerNote: (guild: string) => `You are receiving this once because Sentinel was added to **${guild}**, which you own. Sentinel does not send any other direct messages.`,
    footer: 'Sentinel · Discord logging bot'
  },
  it: {
    title: 'Grazie per aver aggiunto Sentinel',
    intro: 'Sentinel registra ciò che accade in questo server e lo pubblica nei canali di log che scegli. È in sola lettura: non banna, non espelle e non elimina nulla.',
    stepsTitle: 'Configuralo in pochi minuti',
    steps: (web: string, guildId: string) => [
      `1. Apri la [dashboard](${web}/it/dashboard/${guildId}) e accedi con Discord.`,
      '2. Scegli un **canale di log predefinito**: lì Sentinel deve poter *vedere il canale*, *inviare messaggi* e *incorporare link*.',
      '3. Attiva i **logger** che ti servono. Si configura tutto dalla dashboard, non ci sono comandi.'
    ].join('\n'),
    guide: 'Guida',
    privacy: 'Privacy e termini',
    support: 'Supporto',
    links: (web: string, support: string) => `[Primi passi](${web}/it/getting-started) · [Privacy e termini](${web}/it/legal) · [Server di supporto](${support})`,
    ownerNote: (guild: string) => `Ricevi questo messaggio una sola volta perché Sentinel è stato aggiunto a **${guild}**, di cui sei proprietario. Sentinel non invia altri messaggi privati.`,
    footer: 'Sentinel · bot di log per Discord'
  }
} as const;

export const welcomeLocale = (preferredLocale: string | null | undefined): Locale =>
  preferredLocale?.toLowerCase().startsWith('it') ? 'it' : 'en';

/** Escapes a server name so it cannot inject markdown or mentions. */
const plain = (value: string) => value.replace(/[\\*_~`|>[\]()@#<]/g, (char) => `\\${char}`).slice(0, 100);

export function welcomeEmbed(locale: Locale, guildId: string, guildName: string | null, forOwner: boolean) {
  const c = copy[locale];
  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle(c.title)
    .setDescription(c.intro)
    .addFields(
      { name: c.stepsTitle, value: c.steps(config.webUrl, guildId) },
      { name: `${c.guide} · ${c.privacy} · ${c.support}`, value: c.links(config.webUrl, config.supportUrl) }
    )
    .setFooter({ text: c.footer });
  if (forOwner && guildName) embed.addFields({ name: '​', value: c.ownerNote(plain(guildName)) });
  return embed;
}

/** The system channel if Sentinel can post there, otherwise the first text channel it can. */
function welcomeChannel(guild: Guild): TextChannel | null {
  const me = guild.members.me;
  if (!me) return null;
  const canPost = (channel: TextChannel) => channel.permissionsFor(me)?.has(NEEDED) ?? false;
  if (guild.systemChannel && canPost(guild.systemChannel)) return guild.systemChannel;
  const candidates = [...guild.channels.cache.values()]
    .filter((channel): channel is TextChannel => channel.type === ChannelType.GuildText)
    .sort((a, b) => a.position - b.position);
  return candidates.find(canPost) ?? null;
}

export async function sendWelcome(guild: Guild) {
  const locale = welcomeLocale(guild.preferredLocale);
  const channel = welcomeChannel(guild);
  if (channel) {
    await channel.send({ embeds: [welcomeEmbed(locale, guild.id, guild.name, false)], allowedMentions: { parse: [] } })
      .catch((error: unknown) => logger.warn({ guildId: guild.id, error: String(error) }, 'Welcome message not delivered'));
  }
  // Owners may have direct messages from server members turned off: that is
  // their choice and the message is simply skipped.
  const owner = await guild.fetchOwner().catch(() => null);
  if (owner && !owner.user.bot) {
    await owner.send({ embeds: [welcomeEmbed(locale, guild.id, guild.name, true)], allowedMentions: { parse: [] } })
      .catch((error: unknown) => logger.info({ guildId: guild.id, error: String(error) }, 'Welcome DM to the owner not delivered'));
  }
}
