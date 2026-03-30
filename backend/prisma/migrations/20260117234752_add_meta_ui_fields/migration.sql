-- CreateEnum
CREATE TYPE "StatusKind" AS ENUM ('now', 'upcoming', 'rerun');

-- AlterTable
ALTER TABLE "ContentMetaOverride" ADD COLUMN     "hasMultipleTheatrical" BOOLEAN,
ADD COLUMN     "kobisMovieCd" TEXT,
ADD COLUMN     "originalTheatricalDate" TEXT,
ADD COLUMN     "rerunKobisMovieCd" TEXT,
ADD COLUMN     "rerunTheatricalDate" TEXT,
ADD COLUMN     "statusKind" "StatusKind",
ADD COLUMN     "unifiedYearLabel" TEXT;

-- AlterTable
ALTER TABLE "ContentMetaResolved" ADD COLUMN     "hasMultipleTheatrical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kobisMovieCd" TEXT,
ADD COLUMN     "originalTheatricalDate" TEXT,
ADD COLUMN     "rerunKobisMovieCd" TEXT,
ADD COLUMN     "rerunTheatricalDate" TEXT,
ADD COLUMN     "statusKind" "StatusKind",
ADD COLUMN     "unifiedYearLabel" TEXT;
