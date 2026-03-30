ALTER TABLE "ContentIssueReport"
  ADD COLUMN IF NOT EXISTS "userDeletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ContentIssueReport_reporterUserId_userDeletedAt_adminRepliedAt_idx"
  ON "ContentIssueReport"("reporterUserId", "userDeletedAt", "adminRepliedAt");
