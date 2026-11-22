-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('LOAN_DUE_SOON', 'LOAN_OVERDUE', 'HOLD_EXPIRING_SOON');

-- CreateTable
CREATE TABLE "MissedPickup" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "holdId" INTEGER NOT NULL,
    "excused" BOOLEAN NOT NULL DEFAULT false,
    "excusedReason" TEXT,
    "fineId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MissedPickup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderMark" (
    "id" SERIAL NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "userId" INTEGER NOT NULL,
    "loanId" INTEGER,
    "holdId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderMark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLease" (
    "name" TEXT NOT NULL,
    "lockedUntil" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastStartedAt" TIMESTAMP(3),
    "lastFinishedAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "lastStats" JSONB,

    CONSTRAINT "JobLease_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE UNIQUE INDEX "MissedPickup_holdId_key" ON "MissedPickup"("holdId");

-- CreateIndex
CREATE INDEX "MissedPickup_userId_fineId_idx" ON "MissedPickup"("userId", "fineId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderMark_kind_loanId_key" ON "ReminderMark"("kind", "loanId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderMark_kind_holdId_key" ON "ReminderMark"("kind", "holdId");

-- AddForeignKey
ALTER TABLE "MissedPickup" ADD CONSTRAINT "MissedPickup_holdId_fkey" FOREIGN KEY ("holdId") REFERENCES "Hold"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissedPickup" ADD CONSTRAINT "MissedPickup_fineId_fkey" FOREIGN KEY ("fineId") REFERENCES "Fine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddCheckConstraint: exactly one of loanId / holdId is set on ReminderMark, matching its kind
ALTER TABLE "ReminderMark" ADD CONSTRAINT reminder_mark_target_check CHECK (
    ("kind" = 'HOLD_EXPIRING_SOON' AND "holdId" IS NOT NULL AND "loanId" IS NULL) OR
    ("kind" IN ('LOAN_DUE_SOON', 'LOAN_OVERDUE') AND "loanId" IS NOT NULL AND "holdId" IS NULL)
);

