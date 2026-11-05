-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('WAITING', 'PROMOTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationCancelReason" AS ENUM ('MEMBER', 'STAFF', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "Reservation" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "bookId" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'WAITING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promotedAt" TIMESTAMP(3),
    "holdId" INTEGER,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" "ReservationCancelReason",
    "cancelledById" INTEGER,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_holdId_key" ON "Reservation"("holdId");

-- CreateIndex
CREATE INDEX "Reservation_bookId_status_id_idx" ON "Reservation"("bookId", "status", "id");

-- CreateIndex
CREATE INDEX "Reservation_userId_status_idx" ON "Reservation"("userId", "status");

-- CreateIndex: Partial unique index to enforce at most one WAITING reservation per user and book
CREATE UNIQUE INDEX reservation_one_waiting_per_user_book ON "Reservation" ("userId", "bookId") WHERE status = 'WAITING';

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_holdId_fkey" FOREIGN KEY ("holdId") REFERENCES "Hold"("id") ON DELETE SET NULL ON UPDATE CASCADE;
