-- CreateTable
CREATE TABLE "EmailAuthToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailAuthToken_tokenHash_key" ON "EmailAuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailAuthToken_email_idx" ON "EmailAuthToken"("email");

-- CreateIndex
CREATE INDEX "EmailAuthToken_expiresAt_idx" ON "EmailAuthToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "EmailAuthToken" ADD CONSTRAINT "EmailAuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
