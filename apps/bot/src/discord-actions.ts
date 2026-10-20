import { Routes, type Client, type EmbedBuilder, type Guild, type GuildMember, type TextChannel } from 'discord.js';

export type GuildLeaveReason = 'super-console' | 'blocked-guild' | 'blocked-installer';

/**
 * The only high-level Discord mutations Sentinel intentionally exposes besides
 * log delivery (dispatcher.ts). The REST capability policy independently
 * restricts the underlying requests to DELETE /users/@me/guilds/:guildId,
 * PATCH /guilds/:guildId/members/@me (nickname and banner only),
 * POST /users/@me/channels (one-to-one DM only) and POST /channels/:id/messages.
 */
export async function leaveGuild(guild: Guild, _reason: GuildLeaveReason) {
  return guild.leave();
}

export type OwnGuildProfile = {
  /** null restores the global username. */
  nick?: string | null;
  /** data:image/...;base64 URI, or null to remove the server banner. */
  banner?: string | null;
};

/** Brand plan: the bot's own nickname and banner in one server. */
export async function editOwnGuildProfile(client: Client, guildId: string, profile: OwnGuildProfile) {
  const body: OwnGuildProfile = {};
  if (profile.nick !== undefined) body.nick = profile.nick;
  if (profile.banner !== undefined) body.banner = profile.banner;
  return client.rest.patch(Routes.guildMember(guildId, '@me'), { body });
}

/** One-time welcome when Sentinel joins a server: never mentions anyone. */
export async function postWelcome(channel: TextChannel, embed: EmbedBuilder) {
  return channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
}

/** One-time welcome DM to the owner of a server Sentinel just joined. */
export async function sendOwnerWelcome(owner: GuildMember, embed: EmbedBuilder) {
  return owner.send({ embeds: [embed], allowedMentions: { parse: [] } });
}
