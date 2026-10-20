-- Alert routing: categories and severities, delivery state, incidents,
-- routing settings and the daily digest.
ALTER TABLE "InstanceEvent" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'errors';
ALTER TABLE "InstanceEvent" ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'info';
ALTER TABLE "InstanceEvent" ADD COLUMN "deliveryState" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "InstanceEvent" ADD COLUMN "deliveredAt" TIMESTAMP(3);
-- Events recorded so far were already posted by the bot: never resend them.
UPDATE "InstanceEvent" SET "deliveryState" = 'log';
CREATE INDEX "InstanceEvent_deliveryState_createdAt_idx" ON "InstanceEvent"("deliveryState", "createdAt");
-- Instance-wide delivery checks (pending backlog, failures) without a server filter.
CREATE INDEX "LogEvent_dispatchState_createdAt_idx" ON "LogEvent"("dispatchState", "createdAt");

ALTER TABLE "InstanceConfig" ADD COLUMN "alertSettings" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "InstanceConfig" ADD COLUMN "lastDigestAt" TIMESTAMP(3);

CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "lastRemindedAt" TIMESTAMP(3),
    "reminders" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Incident_key_resolvedAt_idx" ON "Incident"("key", "resolvedAt");
CREATE INDEX "Incident_openedAt_idx" ON "Incident"("openedAt" DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sentinel_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Incident" TO sentinel_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sentinel_bot') THEN
    REVOKE ALL ON TABLE "Incident" FROM sentinel_bot;
  END IF;
END
$$;
