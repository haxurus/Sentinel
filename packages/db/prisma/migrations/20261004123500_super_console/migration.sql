-- Global installation blocks and super-admin audit log.
CREATE TABLE "InstallBlock" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "reason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InstallBlock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SuperAdminAudit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "details" JSONB NOT NULL,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SuperAdminAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InstallBlock_kind_subjectId_key" ON "InstallBlock"("kind", "subjectId");
CREATE INDEX "InstallBlock_kind_createdAt_idx" ON "InstallBlock"("kind", "createdAt" DESC);
CREATE INDEX "SuperAdminAudit_createdAt_idx" ON "SuperAdminAudit"("createdAt" DESC);
CREATE INDEX "SuperAdminAudit_subjectType_subjectId_createdAt_idx" ON "SuperAdminAudit"("subjectType", "subjectId", "createdAt" DESC);

-- Existing production installs already have the runtime roles when this
-- migration runs. Fresh installs create them immediately afterwards in
-- harden-users.sh, so the conditional grants keep both paths valid.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sentinel_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "InstallBlock", "SuperAdminAudit" TO sentinel_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sentinel_bot') THEN
    GRANT SELECT ON TABLE "InstallBlock" TO sentinel_bot;
    REVOKE ALL ON TABLE "SuperAdminAudit" FROM sentinel_bot;
  END IF;
END
$$;
