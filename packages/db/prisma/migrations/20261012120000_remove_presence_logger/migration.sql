-- The presence logger is removed: Sentinel no longer records members' online
-- status or activities. Delete what it stored and its configuration. The
-- presenceLoggingEnabled column stays (unused) so a rollback keeps working.
DELETE FROM "LogEvent" WHERE "eventKey" = 'presence.update';
DELETE FROM "LogRoute" WHERE "eventKey" = 'presence.update';
UPDATE "GuildSettings" SET "presenceLoggingEnabled" = false WHERE "presenceLoggingEnabled" = true;
