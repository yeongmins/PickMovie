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
  ADD COLUMN IF NOT EXISTS "mediaType" "MediaType",
  ADD COLUMN IF NOT EXISTS "tmdbId" INTEGER,
  ADD COLUMN IF NOT EXISTS "contentTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "issueMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "issueDetail" TEXT,
  ADD COLUMN IF NOT EXISTS "reporterUserId" INTEGER,
  ADD COLUMN IF NOT EXISTS "reporterName" TEXT,
  ADD COLUMN IF NOT EXISTS "reporterEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "visitorId" TEXT,
  ADD COLUMN IF NOT EXISTS "source" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3);

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
