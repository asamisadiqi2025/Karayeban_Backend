-- AlterTable: add new singular contact columns
ALTER TABLE "markets" ADD COLUMN "phone" VARCHAR(30);
ALTER TABLE "markets" ADD COLUMN "email" VARCHAR(255);

-- Backfill from the first element of the old array columns before dropping them
UPDATE "markets" SET "phone" = "phones"[1] WHERE array_length("phones", 1) > 0;
UPDATE "markets" SET "email" = "emails"[1] WHERE array_length("emails", 1) > 0;

-- Drop old array columns
ALTER TABLE "markets" DROP COLUMN "phones";
ALTER TABLE "markets" DROP COLUMN "emails";
