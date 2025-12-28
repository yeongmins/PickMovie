-- CreateEnum
CREATE TYPE "TrendSource" AS ENUM ('kobis', 'youtube', 'naver', 'netflix');

-- CreateEnum
CREATE TYPE "TrendMediaType" AS ENUM ('movie', 'tv', 'anime', 'unknown');

-- CreateTable
CREATE TABLE "Playlist" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaylistItem" (
    "id" SERIAL NOT NULL,
    "playlistId" INTEGER NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaylistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendSeed" (
    "id" SERIAL NOT NULL,
    "keyword" TEXT NOT NULL,
    "source" "TrendSource" NOT NULL,
    "mediaType" "TrendMediaType" NOT NULL DEFAULT 'unknown',
    "tmdbId" INTEGER,
    "year" INTEGER,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrendSeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendRank" (
    "id" SERIAL NOT NULL,
    "seedId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "breakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendRank_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Playlist_userId_idx" ON "Playlist"("userId");

-- CreateIndex
CREATE INDEX "PlaylistItem_playlistId_idx" ON "PlaylistItem"("playlistId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistItem_playlistId_tmdbId_mediaType_key" ON "PlaylistItem"("playlistId", "tmdbId", "mediaType");

-- CreateIndex
CREATE INDEX "TrendSeed_source_mediaType_idx" ON "TrendSeed"("source", "mediaType");

-- CreateIndex
CREATE INDEX "TrendSeed_updatedAt_idx" ON "TrendSeed"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrendSeed_keyword_source_mediaType_key" ON "TrendSeed"("keyword", "source", "mediaType");

-- CreateIndex
CREATE INDEX "TrendRank_date_score_idx" ON "TrendRank"("date", "score");

-- CreateIndex
CREATE UNIQUE INDEX "TrendRank_seedId_date_key" ON "TrendRank"("seedId", "date");

-- AddForeignKey
ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistItem" ADD CONSTRAINT "PlaylistItem_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrendRank" ADD CONSTRAINT "TrendRank_seedId_fkey" FOREIGN KEY ("seedId") REFERENCES "TrendSeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
