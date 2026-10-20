-- Super console monitoring: instance events and the alarm webhook.
ALTER TABLE "InstanceConfig" ADD COLUMN "alertWebhookUrl" TEXT;

CREATE TABLE "InstanceEvent" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstanceEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InstanceEvent_createdAt_idx" ON "InstanceEvent"("createdAt" DESC);

-- Production roles already exist when this runs; fresh installs get the same
-- grants from harden-users.sh right after the migrations. The bot may only
-- insert (createMany, no RETURNING): it never reads the events back.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sentinel_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "InstanceEvent" TO sentinel_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sentinel_bot') THEN
    REVOKE ALL ON TABLE "InstanceEvent" FROM sentinel_bot;
    GRANT INSERT ON TABLE "InstanceEvent" TO sentinel_bot;
  END IF;
END
$$;
