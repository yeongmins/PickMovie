-- Guard for environments where SearchPopularContent is created by a later migration.
ALTER TABLE IF EXISTS "SearchPopularContent"
ALTER COLUMN "updatedAt" DROP DEFAULT;
