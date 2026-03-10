CREATE TABLE "ContentIssueReport" (
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

CREATE INDEX "ContentIssueReport_createdAt_idx" ON "ContentIssueReport"("createdAt");
CREATE INDEX "ContentIssueReport_mediaType_tmdbId_createdAt_idx" ON "ContentIssueReport"("mediaType", "tmdbId", "createdAt");
CREATE INDEX "ContentIssueReport_reporterUserId_idx" ON "ContentIssueReport"("reporterUserId");

ALTER TABLE "ContentIssueReport"
  ADD CONSTRAINT "ContentIssueReport_reporterUserId_fkey"
  FOREIGN KEY ("reporterUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
