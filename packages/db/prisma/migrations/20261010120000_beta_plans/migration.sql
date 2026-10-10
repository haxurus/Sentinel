-- Beta programme: subscription plans, waitlist, install grants, coupons and
-- the instance-wide status channel. Expand-only: the previous release keeps
-- working on this schema (premiumEnabled stays in sync with the plan).

ALTER TABLE "GuildSettings"
  ADD COLUMN "planTier" TEXT NOT NULL DEFAULT 'FREE',
  ADD COLUMN "planBilling" TEXT,
  ADD COLUMN "planExpiresAt" TIMESTAMP(3),
  ADD COLUMN "planCouponCode" TEXT,
  ADD COLUMN "planNote" TEXT,
  ADD COLUMN "planUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "brandNickname" TEXT,
  ADD COLUMN "brandBannerSet" BOOLEAN NOT NULL DEFAULT false;

-- Premium used to unlock every logger, which is now the Pro plan.
UPDATE "GuildSettings"
SET "planTier" = 'TIER2', "planBilling" = 'GIFT', "planUpdatedAt" = CURRENT_TIMESTAMP
WHERE "premiumEnabled" = true;

CREATE TABLE "InstanceConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "waitlistOpen" BOOLEAN NOT NULL DEFAULT false,
    "contactEmail" TEXT,
    "contactDiscord" TEXT,
    "contactUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InstanceConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StatusChannel" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StatusChannel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "guildName" TEXT,
    "memberCount" INTEGER NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InstallGrant" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InstallGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "percentOff" INTEGER,
    "amountOffCents" INTEGER,
    "tiers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "billing" TEXT NOT NULL DEFAULT 'ANY',
    "maxRedemptions" INTEGER,
    "redemptions" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "public" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WaitlistEntry_userId_guildId_key" ON "WaitlistEntry"("userId", "guildId");
CREATE INDEX "WaitlistEntry_status_createdAt_idx" ON "WaitlistEntry"("status", "createdAt" DESC);
CREATE INDEX "WaitlistEntry_guildId_idx" ON "WaitlistEntry"("guildId");
CREATE UNIQUE INDEX "InstallGrant_kind_subjectId_key" ON "InstallGrant"("kind", "subjectId");
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- Servers that already run the bot stay authorised once the beta gate is on.
INSERT INTO "InstallGrant" ("id", "kind", "subjectId", "source", "createdAt")
SELECT 'legacy_' || "guildId", 'GUILD', "guildId", 'LEGACY', CURRENT_TIMESTAMP
FROM "GuildSettings"
ON CONFLICT ("kind", "subjectId") DO NOTHING;

-- Bot status events are now sent to the instance status channel only.
DELETE FROM "LogRoute" WHERE "eventKey" IN ('system.ready', 'system.error', 'system.warn');

-- Production roles already exist when this runs; fresh installs get the same
-- grants from harden-users.sh right after the migrations.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sentinel_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      "InstanceConfig", "StatusChannel", "WaitlistEntry", "InstallGrant", "Coupon"
    TO sentinel_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sentinel_bot') THEN
    GRANT SELECT ON TABLE "StatusChannel", "InstallGrant" TO sentinel_bot;
    REVOKE ALL ON TABLE "InstanceConfig", "WaitlistEntry", "Coupon" FROM sentinel_bot;
  END IF;
END
$$;
