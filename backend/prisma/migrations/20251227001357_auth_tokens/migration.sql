/*
  Warnings:

  - A unique constraint covering the columns `[replacedByTokenId]` on the table `RefreshToken` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "PasswordResetToken_tokenHash_idx";

-- DropIndex
DROP INDEX "RefreshToken_tokenHash_idx";

-- AlterTable
ALTER TABLE "PasswordResetToken" ADD COLUMN     "ip" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_replacedByTokenId_key" ON "RefreshToken"("replacedByTokenId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");
