-- New plan retention limits: Free 15, Plus 30, Pro 60, Brand 90 days.
ALTER TABLE "GuildSettings" ALTER COLUMN "defaultRetentionDays" SET DEFAULT 15;

-- Stored settings above the new limit are clamped so the dashboard shows
-- the retention that is actually applied.
UPDATE "GuildSettings" g
SET "defaultRetentionDays" = l.max_days
FROM (VALUES ('FREE', 15), ('TIER1', 30), ('TIER2', 60), ('TIER3', 90)) AS l(tier, max_days)
WHERE g."planTier" = l.tier AND g."defaultRetentionDays" > l.max_days;

UPDATE "LogRoute" r
SET "retentionDays" = l.max_days
FROM "GuildSettings" g, (VALUES ('FREE', 15), ('TIER1', 30), ('TIER2', 60), ('TIER3', 90)) AS l(tier, max_days)
WHERE r."guildId" = g."guildId" AND g."planTier" = l.tier AND r."retentionDays" > l.max_days;
