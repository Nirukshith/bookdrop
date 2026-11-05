-- CreateEnum
CREATE TYPE "ReturnCondition" AS ENUM ('GOOD', 'DAMAGED');

-- CreateEnum
CREATE TYPE "FineReason" AS ENUM ('LATE_RETURN', 'MISSED_PICKUPS', 'LOST_BOOK', 'DAMAGED_BOOK');

-- CreateEnum
CREATE TYPE "FineStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'WAIVED');

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "conditionNote" TEXT,
ADD COLUMN     "lostAt" TIMESTAMP(3),
ADD COLUMN     "returnCondition" "ReturnCondition",
ADD COLUMN     "returnedById" INTEGER;

-- CreateTable
CREATE TABLE "Fine" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "reason" "FineReason" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "paidMinor" INTEGER NOT NULL DEFAULT 0,
    "status" "FineStatus" NOT NULL DEFAULT 'UNPAID',
    "loanId" INTEGER,
    "daysLate" INTEGER,
    "note" TEXT,
    "dedupeKey" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "waivedById" INTEGER,
    "waivedReason" TEXT,

    CONSTRAINT "Fine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinePayment" (
    "id" SERIAL NOT NULL,
    "fineId" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "receivedById" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Fine_dedupeKey_key" ON "Fine"("dedupeKey");

-- CreateIndex
CREATE INDEX "Fine_userId_status_idx" ON "Fine"("userId", "status");

-- CreateIndex
CREATE INDEX "Fine_loanId_idx" ON "Fine"("loanId");

-- CreateIndex
CREATE INDEX "FinePayment_fineId_idx" ON "FinePayment"("fineId");

-- AddForeignKey
ALTER TABLE "Fine" ADD CONSTRAINT "Fine_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinePayment" ADD CONSTRAINT "FinePayment_fineId_fkey" FOREIGN KEY ("fineId") REFERENCES "Fine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints on Fine and FinePayment
ALTER TABLE "Fine" ADD CONSTRAINT "fine_amount_minor_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "Fine" ADD CONSTRAINT "fine_paid_minor_bounds" CHECK ("paidMinor" >= 0 AND "paidMinor" <= "amountMinor");
ALTER TABLE "FinePayment" ADD CONSTRAINT "fine_payment_amount_minor_positive" CHECK ("amountMinor" > 0);

-- Backfill returnCondition = 'GOOD' for existing loans with status RETURNED
UPDATE "Loan" SET "returnCondition" = 'GOOD' WHERE "status" = 'RETURNED';

