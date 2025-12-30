-- CreateEnum
CREATE TYPE "TrendRunStatus" AS ENUM ('running', 'success', 'failed');

-- AlterTable
ALTER TABLE "TrendSeed" ADD COLUMN     "topicId" INTEGER;

-- CreateTable
CREATE TABLE "TrendIngestRun" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'KR',
    "status" "TrendRunStatus" NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "meta" JSONB,

    CONSTRAINT "TrendIngestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendSnapshot" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "source" "TrendSource" NOT NULL,
    "endpoint" TEXT,
    "request" JSONB,
    "response" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendTopic" (
    "id" SERIAL NOT NULL,
    "mediaType" "TrendMediaType" NOT NULL DEFAULT 'unknown',
    "tmdbId" INTEGER,
    "year" INTEGER,
    "canonicalTitle" TEXT NOT NULL,
    "normTitle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrendTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendTopicAlias" (
    "id" SERIAL NOT NULL,
    "topicId" INTEGER NOT NULL,
    "alias" TEXT NOT NULL,
    "normAlias" TEXT NOT NULL,
    "source" "TrendSource",
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,

    CONSTRAINT "TrendTopicAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendMetric" (
    "id" SERIAL NOT NULL,
    "topicId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "source" "TrendSource" NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "valueLog" DOUBLE PRECISION,
    "z" DOUBLE PRECISION,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendScore" (
    "id" SERIAL NOT NULL,
    "topicId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "algoVersion" TEXT NOT NULL DEFAULT 'kr.daily.v1',
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "breakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrendIngestRun_status_startedAt_idx" ON "TrendIngestRun"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrendIngestRun_date_region_key" ON "TrendIngestRun"("date", "region");

-- CreateIndex
CREATE INDEX "TrendSnapshot_runId_source_idx" ON "TrendSnapshot"("runId", "source");

-- CreateIndex
CREATE INDEX "TrendSnapshot_source_fetchedAt_idx" ON "TrendSnapshot"("source", "fetchedAt");

-- CreateIndex
CREATE INDEX "TrendTopic_tmdbId_idx" ON "TrendTopic"("tmdbId");

-- CreateIndex
CREATE INDEX "TrendTopic_updatedAt_idx" ON "TrendTopic"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrendTopic_mediaType_normTitle_key" ON "TrendTopic"("mediaType", "normTitle");

-- CreateIndex
CREATE INDEX "TrendTopicAlias_normAlias_idx" ON "TrendTopicAlias"("normAlias");

-- CreateIndex
CREATE UNIQUE INDEX "TrendTopicAlias_topicId_normAlias_key" ON "TrendTopicAlias"("topicId", "normAlias");

-- CreateIndex
CREATE INDEX "TrendMetric_date_metric_idx" ON "TrendMetric"("date", "metric");

-- CreateIndex
CREATE INDEX "TrendMetric_source_metric_date_idx" ON "TrendMetric"("source", "metric", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TrendMetric_topicId_date_source_metric_key" ON "TrendMetric"("topicId", "date", "source", "metric");

-- CreateIndex
CREATE INDEX "TrendScore_date_algoVersion_score_idx" ON "TrendScore"("date", "algoVersion", "score");

-- CreateIndex
CREATE UNIQUE INDEX "TrendScore_topicId_date_algoVersion_key" ON "TrendScore"("topicId", "date", "algoVersion");

-- CreateIndex
CREATE INDEX "TrendSeed_topicId_idx" ON "TrendSeed"("topicId");

-- AddForeignKey
ALTER TABLE "TrendSeed" ADD CONSTRAINT "TrendSeed_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "TrendTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrendSnapshot" ADD CONSTRAINT "TrendSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TrendIngestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrendTopicAlias" ADD CONSTRAINT "TrendTopicAlias_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "TrendTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrendMetric" ADD CONSTRAINT "TrendMetric_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "TrendTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrendScore" ADD CONSTRAINT "TrendScore_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "TrendTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
