-- CreateEnum
CREATE TYPE "HoldStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "HoldSource" AS ENUM ('REQUEST', 'QUEUE_PROMOTION');

-- AlterTable
ALTER TABLE "Copy" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Hold" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "bookId" INTEGER NOT NULL,
    "copyId" INTEGER NOT NULL,
    "status" "HoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "HoldSource" NOT NULL DEFAULT 'REQUEST',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedNote" TEXT,

    CONSTRAINT "Hold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Hold_userId_status_idx" ON "Hold"("userId", "status");

-- CreateIndex
CREATE INDEX "Hold_status_expiresAt_idx" ON "Hold"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Hold_bookId_idx" ON "Hold"("bookId");

-- AddForeignKey
ALTER TABLE "Hold" ADD CONSTRAINT "Hold_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "Copy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial unique indexes for active holds (cannot be represented natively in Prisma schema)
CREATE UNIQUE INDEX hold_one_active_per_copy ON "Hold" ("copyId") WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX hold_one_active_per_user_book ON "Hold" ("userId", "bookId") WHERE status = 'ACTIVE';

