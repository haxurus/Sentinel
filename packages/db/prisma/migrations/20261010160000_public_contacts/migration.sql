-- Initial public contacts for the pricing and beta pages. Values already set
-- from the super console are kept; they stay editable there.
INSERT INTO "InstanceConfig" ("id", "waitlistOpen", "contactEmail", "contactDiscord", "updatedAt")
VALUES (1, false, 'haxurus@icloud.com', 'haxurus', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "contactEmail" = COALESCE("InstanceConfig"."contactEmail", EXCLUDED."contactEmail"),
  "contactDiscord" = COALESCE("InstanceConfig"."contactDiscord", EXCLUDED."contactDiscord"),
  "updatedAt" = CURRENT_TIMESTAMP;
