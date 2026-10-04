ALTER TABLE "GuildSettings"
ADD COLUMN "premiumEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "GuildSettings"
SET
  "rawGatewayEnabled" = false,
  "presenceLoggingEnabled" = false,
  "typingLoggingEnabled" = false;

UPDATE "LogRoute"
SET
  "captureEnabled" = false,
  "enabled" = false
WHERE "eventKey" IN ('message.create', 'reaction.add', 'reaction.remove', 'poll.vote_add', 'poll.vote_remove', 'voice.effect', 'voice.server_update', 'thread.members_update', 'thread.member_update', 'thread.list_sync', 'guild.available', 'guild.unavailable', 'scheduled.user_add', 'scheduled.user_remove', 'soundboard.sync', 'interaction.create', 'user.update', 'audit.entry', 'presence.update', 'typing.start', 'raw.gateway', 'system.warn');
