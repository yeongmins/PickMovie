CREATE TABLE "ContentMetaOverrideHistory" (
  "id" TEXT NOT NULL,
  "mediaType" "MetaMediaType" NOT NULL,
  "tmdbId" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "changedFields" JSONB,
  "beforeSnapshot" JSONB,
  "afterSnapshot" JSONB,
  "beforeTitle" TEXT,
  "afterTitle" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContentMetaOverrideHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SearchPolicyConfig" (
  "key" TEXT NOT NULL,
  "blockedKeywords" JSONB NOT NULL,
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SearchPolicyConfig_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "ContentMetaOverrideHistory_mediaType_tmdbId_createdAt_idx"
ON "ContentMetaOverrideHistory"("mediaType", "tmdbId", "createdAt");

CREATE INDEX "ContentMetaOverrideHistory_createdAt_idx"
ON "ContentMetaOverrideHistory"("createdAt");
