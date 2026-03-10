CREATE TABLE "AnalyzeEvent" (
  "id" SERIAL NOT NULL,
  "visitorId" TEXT NOT NULL,
  "userId" INTEGER,
  "isAuthed" BOOLEAN NOT NULL DEFAULT false,
  "genres" JSONB NOT NULL,
  "moods" JSONB NOT NULL,
  "runtime" TEXT,
  "releaseYear" TEXT,
  "country" TEXT,
  "excludes" JSONB NOT NULL,
  "favoriteMovieIds" JSONB NOT NULL,
  "favoriteCount" INTEGER NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL DEFAULT 'analyze',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AnalyzeEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnalyzeEvent_createdAt_idx" ON "AnalyzeEvent"("createdAt");
CREATE INDEX "AnalyzeEvent_userId_idx" ON "AnalyzeEvent"("userId");
CREATE INDEX "AnalyzeEvent_isAuthed_idx" ON "AnalyzeEvent"("isAuthed");
CREATE INDEX "AnalyzeEvent_visitorId_createdAt_idx" ON "AnalyzeEvent"("visitorId", "createdAt");

ALTER TABLE "AnalyzeEvent"
  ADD CONSTRAINT "AnalyzeEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
