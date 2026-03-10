ALTER TABLE "ContentIssueReport"
  ADD COLUMN IF NOT EXISTS "userReadAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ContentIssueReport_reporterUserId_userReadAt_adminRepliedAt_idx"
  ON "ContentIssueReport"("reporterUserId", "userReadAt", "adminRepliedAt");
