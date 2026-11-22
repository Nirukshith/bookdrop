-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "membershipNumber" TEXT,
ADD COLUMN     "membershipReviewedAt" TIMESTAMP(3),
ADD COLUMN     "membershipReviewedById" INTEGER,
ADD COLUMN     "membershipStatus" "MembershipStatus" NOT NULL DEFAULT 'APPROVED';

-- CreateIndex
CREATE UNIQUE INDEX "User_membershipNumber_key" ON "User"("membershipNumber");

-- CreateIndex
CREATE INDEX "User_membershipStatus_idx" ON "User"("membershipStatus");

