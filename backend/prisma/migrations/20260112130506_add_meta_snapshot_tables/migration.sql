-- CreateEnum
CREATE TYPE "MetaMediaType" AS ENUM ('movie', 'tv');

-- CreateEnum
CREATE TYPE "ContentKind" AS ENUM ('MOVIE', 'TV', 'ANI');

-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('NOW_SHOWING', 'UPCOMING', 'RE_RELEASE', 'NONE');

-- CreateEnum
CREATE TYPE "AgeRating" AS ENUM ('ALL', 'R12', 'R15', 'R19', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "HomeCollectionKey" AS ENUM ('POPULAR_MOVIE', 'POPULAR_TV', 'TRENDING_MOVIE', 'TRENDING_TV');

-- CreateTable
CREATE TABLE "ContentMetaResolved" (
    "id" TEXT NOT NULL,
    "mediaType" "MetaMediaType" NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "contentKind" "ContentKind" NOT NULL,
    "releaseStatus" "ReleaseStatus" NOT NULL,
    "ageRating" "AgeRating" NOT NULL,
    "releaseYear" INTEGER,
    "watchProviders" JSONB,
    "sourcesUsed" JSONB,
    "metaVersion" INTEGER NOT NULL DEFAULT 1,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentMetaResolved_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentMetaOverride" (
    "id" TEXT NOT NULL,
    "mediaType" "MetaMediaType" NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "contentKind" "ContentKind",
    "releaseStatus" "ReleaseStatus",
    "ageRating" "AgeRating",
    "releaseYear" INTEGER,
    "watchProviders" JSONB,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentMetaOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeCollectionSnapshot" (
    "id" TEXT NOT NULL,
    "key" "HomeCollectionKey" NOT NULL,
    "items" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeCollectionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KobisBoxOfficeSnapshot" (
    "id" TEXT NOT NULL,
    "targetDt" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KobisBoxOfficeSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentMetaResolved_resolvedAt_idx" ON "ContentMetaResolved"("resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentMetaResolved_mediaType_tmdbId_key" ON "ContentMetaResolved"("mediaType", "tmdbId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentMetaOverride_mediaType_tmdbId_key" ON "ContentMetaOverride"("mediaType", "tmdbId");

-- CreateIndex
CREATE UNIQUE INDEX "HomeCollectionSnapshot_key_key" ON "HomeCollectionSnapshot"("key");

-- CreateIndex
CREATE UNIQUE INDEX "KobisBoxOfficeSnapshot_targetDt_key" ON "KobisBoxOfficeSnapshot"("targetDt");
