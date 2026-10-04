import type { Guild } from 'discord.js';

export type GuildLeaveReason = 'super-console' | 'blocked-guild' | 'blocked-installer';

/**
 * The only high-level Discord mutation Sentinel intentionally exposes.
 * The REST capability policy independently restricts the underlying request to
 * DELETE /users/@me/guilds/:guildId.
 */
export async function leaveGuild(guild: Guild, _reason: GuildLeaveReason) {
  return guild.leave();
}
