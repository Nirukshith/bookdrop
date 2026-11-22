-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "priceMinor" INTEGER;

-- AlterTable
ALTER TABLE "Fine" ADD COLUMN     "capMinor" INTEGER,
ADD COLUMN     "uncappedAmountMinor" INTEGER;

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "priceMinorAtBorrow" INTEGER;

-- CHECK constraint on Book.priceMinor
ALTER TABLE "Book" ADD CONSTRAINT "book_price_minor_positive" CHECK ("priceMinor" IS NULL OR "priceMinor" > 0);

-- CHECK constraint on Fine.uncappedAmountMinor and Fine.capMinor
ALTER TABLE "Fine" ADD CONSTRAINT "fine_uncapped_amount_positive" CHECK ("uncappedAmountMinor" IS NULL OR "uncappedAmountMinor" > 0);
ALTER TABLE "Fine" ADD CONSTRAINT "fine_cap_minor_positive" CHECK ("capMinor" IS NULL OR "capMinor" > 0);

-- Backfill existing loans from their book's current price (leaves null where book has no price)
UPDATE "Loan" l
SET "priceMinorAtBorrow" = b."priceMinor"
FROM "Book" b
WHERE l."bookId" = b."id" AND b."priceMinor" IS NOT NULL;

