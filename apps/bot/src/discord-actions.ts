import { Routes, type Client, type Guild } from 'discord.js';

export type GuildLeaveReason = 'super-console' | 'blocked-guild' | 'blocked-installer' | 'not-approved';

/**
 * The only high-level Discord mutations Sentinel intentionally exposes.
 * The REST capability policy independently restricts the underlying requests
 * to DELETE /users/@me/guilds/:guildId and PATCH /guilds/:guildId/members/@me
 * (nickname and banner only).
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
