-- Alerts are rendered in the language of the server they are posted to:
-- store a message key (and parameters) instead of a fixed Italian text.
ALTER TABLE "InstanceEvent" ADD COLUMN "messageKey" TEXT;
ALTER TABLE "Incident" ADD COLUMN "messageKey" TEXT;
ALTER TABLE "Incident" ADD COLUMN "params" JSONB NOT NULL DEFAULT '{}';
