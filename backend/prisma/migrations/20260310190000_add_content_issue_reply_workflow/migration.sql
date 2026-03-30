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
