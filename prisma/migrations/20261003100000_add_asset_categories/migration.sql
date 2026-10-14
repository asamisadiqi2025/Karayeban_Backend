-- CreateTable
CREATE TABLE "asset_categories" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "assets" ADD COLUMN "category_id" UUID;

-- Backfill: هر متنِ دسته‌بندیِ قدیمی (به‌ازای هر مارکت، بدون حساسیت به فاصله و حروف) به یک
-- دسته‌بندیِ واقعی تبدیل می‌شود و دارایی‌های مربوط به آن وصل می‌شوند. (md5→uuid تا به نسخهٔ
-- PostgreSQL وابسته نباشیم.)
INSERT INTO "asset_categories" ("id", "market_id", "name", "updated_at")
SELECT md5(random()::text || clock_timestamp()::text || d."market_id"::text || d."key")::uuid,
       d."market_id", d."clean", CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT ON ("market_id", "key") "market_id", "key", "clean"
    FROM (
        SELECT "market_id",
               btrim(regexp_replace("category", '\s+', ' ', 'g')) AS "clean",
               lower(regexp_replace("category", '\s+', '', 'g')) AS "key"
        FROM "assets"
        WHERE "category" IS NOT NULL AND btrim("category") <> ''
    ) s
    ORDER BY "market_id", "key", "clean"
) d;

UPDATE "assets" a
SET "category_id" = c."id"
FROM "asset_categories" c
WHERE a."category" IS NOT NULL
  AND btrim(a."category") <> ''
  AND c."market_id" = a."market_id"
  AND lower(regexp_replace(c."name", '\s+', '', 'g')) = lower(regexp_replace(a."category", '\s+', '', 'g'));

ALTER TABLE "assets" DROP COLUMN "category";

-- CreateIndex
CREATE INDEX "asset_categories_market_id_idx" ON "asset_categories"("market_id");

-- CreateIndex
CREATE INDEX "assets_category_id_idx" ON "assets"("category_id");

-- AddForeignKey
ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "asset_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
