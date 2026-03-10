CREATE TABLE "SearchPopularContent" (
  "id" SERIAL NOT NULL,
  "tmdbId" INTEGER NOT NULL,
  "mediaType" "MediaType" NOT NULL,
  "title" TEXT NOT NULL,
  "searchCount" INTEGER NOT NULL DEFAULT 0,
  "lastSearchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SearchPopularContent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SearchPopularContent_tmdbId_mediaType_key"
  ON "SearchPopularContent"("tmdbId", "mediaType");

CREATE INDEX "SearchPopularContent_searchCount_lastSearchedAt_idx"
  ON "SearchPopularContent"("searchCount", "lastSearchedAt");

CREATE INDEX "SearchPopularContent_updatedAt_idx"
  ON "SearchPopularContent"("updatedAt");
