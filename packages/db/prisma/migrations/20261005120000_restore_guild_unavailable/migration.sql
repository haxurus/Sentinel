-- 20261004144000_premium_high_volume disabled "guild.unavailable" together with
-- the high-volume loggers, but the event catalog never classified it as
-- noisy/Premium: new guilds get it enabled while older ones kept it off.
-- Restore the catalog default only for rows still in the state that migration
-- left: raw SQL does not touch "updatedAt", so rows last written before that
-- release (2026-10-04 ~12:45 UTC) were never changed from the dashboard since.
UPDATE "LogRoute"
SET
  "captureEnabled" = true,
  "enabled" = true
WHERE "eventKey" = 'guild.unavailable'
  AND "captureEnabled" = false
  AND "enabled" = false
  AND "updatedAt" < TIMESTAMP '2026-10-04 12:40:00';
