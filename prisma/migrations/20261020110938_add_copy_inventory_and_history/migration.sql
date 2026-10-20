-- AlterTable: 1. Add barcode as nullable
ALTER TABLE "Copy" ADD COLUMN "barcode" TEXT;

-- 2. Backfill existing rows with 'BD-' || lpad(id::text, 6, '0')
UPDATE "Copy" SET "barcode" = 'BD-' || lpad("id"::text, 6, '0') WHERE "barcode" IS NULL;

-- 3. Make barcode NOT NULL and add unique constraint
ALTER TABLE "Copy" ALTER COLUMN "barcode" SET NOT NULL;
CREATE UNIQUE INDEX "Copy_barcode_key" ON "Copy"("barcode");

-- 4. Add the other new columns as nullable or with defaults
ALTER TABLE "Copy" ADD COLUMN "shelfLocation" TEXT;
ALTER TABLE "Copy" ADD COLUMN "notes" TEXT;
ALTER TABLE "Copy" ADD COLUMN "retiredAt" TIMESTAMP(3);
ALTER TABLE "Copy" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Copy" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Copy_bookId_status_idx" ON "Copy"("bookId", "status");

-- CreateTable
CREATE TABLE "CopyStatusHistory" (
    "id" SERIAL NOT NULL,
    "copyId" INTEGER NOT NULL,
    "fromStatus" "CopyStatus",
    "toStatus" "CopyStatus" NOT NULL,
    "reason" TEXT,
    "changedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopyStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CopyStatusHistory_copyId_idx" ON "CopyStatusHistory"("copyId");

-- AddForeignKey
ALTER TABLE "CopyStatusHistory" ADD CONSTRAINT "CopyStatusHistory_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "Copy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
