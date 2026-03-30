CREATE TABLE IF NOT EXISTS "ContentIssueReport" (
  "id" SERIAL NOT NULL,
  "mediaType" "MediaType" NOT NULL,
  "tmdbId" INTEGER NOT NULL,
  "contentTitle" TEXT,
  "issueMessage" TEXT NOT NULL,
  "issueDetail" TEXT,
  "reporterUserId" INTEGER,
  "reporterName" TEXT,
  "reporterEmail" TEXT,
  "visitorId" TEXT,
  "source" TEXT NOT NULL DEFAULT 'detail',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentIssueReport_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ContentIssueReport"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS "adminReply" TEXT,
  ADD COLUMN IF NOT EXISTS "adminRepliedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "adminRepliedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "ContentIssueReport"
SET "status" = COALESCE(NULLIF(TRIM("status"), ''), 'received')
WHERE "status" IS NULL OR TRIM("status") = '';

CREATE INDEX IF NOT EXISTS "ContentIssueReport_status_createdAt_idx"
  ON "ContentIssueReport"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "ContentIssueReport_createdAt_idx"
  ON "ContentIssueReport"("createdAt");
CREATE INDEX IF NOT EXISTS "ContentIssueReport_mediaType_tmdbId_createdAt_idx"
  ON "ContentIssueReport"("mediaType", "tmdbId", "createdAt");
CREATE INDEX IF NOT EXISTS "ContentIssueReport_reporterUserId_idx"
  ON "ContentIssueReport"("reporterUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ContentIssueReport_reporterUserId_fkey'
  ) THEN
    ALTER TABLE "ContentIssueReport"
      ADD CONSTRAINT "ContentIssueReport_reporterUserId_fkey"
      FOREIGN KEY ("reporterUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
