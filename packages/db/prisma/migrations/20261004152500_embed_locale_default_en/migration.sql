ALTER TABLE "GuildSettings"
ALTER COLUMN "locale" SET DEFAULT 'en';

UPDATE "GuildSettings"
SET "locale" = 'en'
WHERE "locale" NOT IN ('en', 'it');
