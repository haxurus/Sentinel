-- Sentinel initial schema
CREATE TABLE "GuildSettings" (
    "guildId" TEXT NOT NULL,
    "guildName" TEXT NOT NULL,
    "iconUrl" TEXT,
    "defaultLogChannelId" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Rome',
    "locale" TEXT NOT NULL DEFAULT 'it-IT',
    "defaultRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "embedColor" TEXT NOT NULL DEFAULT '#3f3c54',
    "embedFooter" TEXT NOT NULL DEFAULT 'Discord Audit',
    "messageSnapshotEnabled" BOOLEAN NOT NULL DEFAULT true,
    "storeMessageContent" BOOLEAN NOT NULL DEFAULT true,
    "rawGatewayEnabled" BOOLEAN NOT NULL DEFAULT false,
    "presenceLoggingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "typingLoggingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GuildSettings_pkey" PRIMARY KEY ("guildId")
);

CREATE TABLE "LogRoute" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "captureEnabled" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "destinationChannelId" TEXT,
    "customTitle" TEXT,
    "customFooter" TEXT,
    "textPrefix" TEXT,
    "thumbnailUrl" TEXT,
    "embedColor" TEXT,
    "showTimestamp" BOOLEAN NOT NULL DEFAULT true,
    "showActor" BOOLEAN NOT NULL DEFAULT true,
    "showTarget" BOOLEAN NOT NULL DEFAULT true,
    "showChannel" BOOLEAN NOT NULL DEFAULT true,
    "includeContent" BOOLEAN NOT NULL DEFAULT true,
    "includeAttachments" BOOLEAN NOT NULL DEFAULT true,
    "ignoreBots" BOOLEAN NOT NULL DEFAULT false,
    "retentionDays" INTEGER,
    "ignoredUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "ignoredRoleIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "ignoredChannelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "mentionRoleIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LogRoute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LogEvent" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "actorId" TEXT,
    "targetId" TEXT,
    "channelId" TEXT,
    "summary" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "dispatchState" TEXT NOT NULL DEFAULT 'PENDING',
    "dispatchError" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LogEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessageSnapshot" (
    "messageId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorTag" TEXT,
    "authorBot" BOOLEAN NOT NULL DEFAULT false,
    "content" TEXT,
    "attachments" JSONB NOT NULL,
    "embeds" JSONB NOT NULL,
    "roleIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MessageSnapshot_pkey" PRIMARY KEY ("messageId")
);

CREATE TABLE "PanelAudit" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PanelAudit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PanelSession" (
    "id" TEXT NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "guilds" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PanelSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PanelRoleBinding" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "discordRoleId" TEXT NOT NULL,
    "accessLevel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PanelRoleBinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LogRoute_guildId_eventKey_key" ON "LogRoute"("guildId", "eventKey");
CREATE INDEX "LogRoute_guildId_idx" ON "LogRoute"("guildId");
CREATE INDEX "LogEvent_guildId_createdAt_idx" ON "LogEvent"("guildId", "createdAt" DESC);
CREATE INDEX "LogEvent_guildId_eventKey_createdAt_idx" ON "LogEvent"("guildId", "eventKey", "createdAt" DESC);
CREATE INDEX "LogEvent_guildId_dispatchState_createdAt_idx" ON "LogEvent"("guildId", "dispatchState", "createdAt" DESC);
CREATE INDEX "LogEvent_actorId_idx" ON "LogEvent"("actorId");
CREATE INDEX "LogEvent_targetId_idx" ON "LogEvent"("targetId");
CREATE INDEX "LogEvent_channelId_idx" ON "LogEvent"("channelId");
CREATE INDEX "MessageSnapshot_guildId_createdAt_idx" ON "MessageSnapshot"("guildId", "createdAt" DESC);
CREATE INDEX "MessageSnapshot_channelId_idx" ON "MessageSnapshot"("channelId");
CREATE INDEX "MessageSnapshot_authorId_idx" ON "MessageSnapshot"("authorId");
CREATE INDEX "PanelAudit_guildId_createdAt_idx" ON "PanelAudit"("guildId", "createdAt" DESC);
CREATE UNIQUE INDEX "PanelSession_sessionTokenHash_key" ON "PanelSession"("sessionTokenHash");
CREATE INDEX "PanelSession_userId_idx" ON "PanelSession"("userId");
CREATE INDEX "PanelSession_expiresAt_idx" ON "PanelSession"("expiresAt");
CREATE UNIQUE INDEX "PanelRoleBinding_guildId_discordRoleId_key" ON "PanelRoleBinding"("guildId", "discordRoleId");
CREATE INDEX "PanelRoleBinding_guildId_idx" ON "PanelRoleBinding"("guildId");

ALTER TABLE "LogRoute" ADD CONSTRAINT "LogRoute_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildSettings"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogEvent" ADD CONSTRAINT "LogEvent_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildSettings"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageSnapshot" ADD CONSTRAINT "MessageSnapshot_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildSettings"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PanelAudit" ADD CONSTRAINT "PanelAudit_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildSettings"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PanelRoleBinding" ADD CONSTRAINT "PanelRoleBinding_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildSettings"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;
