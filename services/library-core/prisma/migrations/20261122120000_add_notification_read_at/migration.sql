-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "readAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");


-- Existing notifications predate the in-app badge: mark them read so members
-- are not greeted with a backlog of old, already-emailed notifications.
UPDATE "Notification" SET "readAt" = "createdAt" WHERE "readAt" IS NULL;
