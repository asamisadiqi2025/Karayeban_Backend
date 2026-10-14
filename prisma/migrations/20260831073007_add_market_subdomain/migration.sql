-- AlterTable: add subdomain as nullable first so existing rows can be backfilled
ALTER TABLE "markets" ADD COLUMN "subdomain" VARCHAR(63);

-- Backfill existing markets with a placeholder subdomain derived from their row order,
-- since we cannot safely auto-slugify non-Latin names. These must be reviewed/renamed
-- to a real subdomain by the vendor (SUPER_ADMIN) before going live with subdomain routing.
UPDATE "markets"
SET "subdomain" = 'market-' || substr(id::text, 1, 8)
WHERE "subdomain" IS NULL;

-- Now enforce NOT NULL + uniqueness going forward
ALTER TABLE "markets" ALTER COLUMN "subdomain" SET NOT NULL;
CREATE UNIQUE INDEX "markets_subdomain_key" ON "markets"("subdomain");
