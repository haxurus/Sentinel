-- Discord Developer Policy compliance.
--
-- 1. The typing and raw Gateway loggers are removed: delete what they stored
--    and their configuration. The settings columns stay (unused) so that a
--    rollback keeps working.
DELETE FROM "LogEvent" WHERE "eventKey" IN ('typing.start', 'raw.gateway');
DELETE FROM "LogRoute" WHERE "eventKey" IN ('typing.start', 'raw.gateway');
UPDATE "GuildSettings" SET "typingLoggingEnabled" = false, "rawGatewayEnabled" = false
WHERE "typingLoggingEnabled" = true OR "rawGatewayEnabled" = true;

-- 2. Paid plans are sold only through Discord Premium Apps, at the same price
--    as everywhere else: coupons and multi-subscription discounts are gone.
--    The Coupon table stays (empty) for the previous release.
DELETE FROM "Coupon";
UPDATE "GuildSettings" SET "planCouponCode" = NULL WHERE "planCouponCode" IS NOT NULL;

ALTER TABLE "GuildSettings" ADD COLUMN "planSource" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "GuildSettings" ADD COLUMN "planEntitlementId" TEXT;
ALTER TABLE "InstanceConfig" ADD COLUMN "discordSkus" JSONB NOT NULL DEFAULT '{}';

-- 3. Servers the bot was removed from are deleted 30 days later.
ALTER TABLE "GuildSettings" ADD COLUMN "removedAt" TIMESTAMP(3);
CREATE INDEX "GuildSettings_removedAt_idx" ON "GuildSettings"("removedAt");
