-- عواید متفرقه: دسته‌بندیِ ۲‌سطحی (کتگوری / سب‌کتگوری) مخصوصِ هر مارکت.
--
-- ترتیبِ این مایگریشن عمداً «expand → backfill → contract» است تا روی جدولِ دارایِ ردیف هم بی‌خطر
-- اجرا شود:
--   ۱) جدولِ دسته‌ها ساخته می‌شود؛
--   ۲) ستون‌های جدید روی miscellaneous_income ابتدا nullable اضافه می‌شوند؛
--   ۳) هر «type»ِ متنیِ قدیمی (در هر مارکت، با مقایسهٔ نرمال‌شده) به یک کتگوریِ مادر تبدیل و ردیف‌ها
--      به آن وصل می‌شوند، نرخِ ارز و سازنده از ردیفِ دفترکل کپی می‌شود؛
--   ۴) فقط بعد از آن ستون‌ها NOT NULL و ایندکس/کلیدِ خارجی ساخته می‌شود.
-- ستونِ type حذف نمی‌شود (فقط nullable می‌شود) تا ردِ تاریخی بماند.

-- ۱) جدولِ دسته‌بندی ------------------------------------------------------------------------
CREATE TABLE "miscellaneous_income_categories" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "name_key" VARCHAR(255) NOT NULL,
    "scope_key" UUID NOT NULL,
    "parent_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "miscellaneous_income_categories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "miscellaneous_income_categories_market_id_parent_id_is_acti_idx" ON "miscellaneous_income_categories"("market_id", "parent_id", "is_active");

CREATE INDEX "miscellaneous_income_categories_parent_id_idx" ON "miscellaneous_income_categories"("parent_id");

-- یکتاییِ نام: مادرها در یک مارکت (scope_key = market_id) و سب‌کتگوری‌ها زیرِ هر مادر (scope_key = parent_id).
CREATE UNIQUE INDEX "miscellaneous_income_categories_scope_key_name_key_key" ON "miscellaneous_income_categories"("scope_key", "name_key");

ALTER TABLE "miscellaneous_income_categories" ADD CONSTRAINT "miscellaneous_income_categories_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "miscellaneous_income_categories" ADD CONSTRAINT "miscellaneous_income_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "miscellaneous_income_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ۲) ستون‌های جدید روی miscellaneous_income (فعلاً nullable) -------------------------------------
ALTER TABLE "miscellaneous_income"
    ADD COLUMN "base_currency_amount" DECIMAL(18,4),
    ADD COLUMN "category_id" UUID,
    ADD COLUMN "created_by_id" UUID,
    ADD COLUMN "exchange_rate" DECIMAL(24,10),
    ADD COLUMN "root_category_id" UUID,
    ALTER COLUMN "type" DROP NOT NULL;

-- ۳) backfill از روی type ------------------------------------------------------------------------
-- name_key همان nameKey() در src/common/utils/category-name.ts است: حذفِ فاصله/نیم‌فاصله،
-- ي→ی، ك→ک، حروفِ کوچک. type خالی به «متفرقه» تبدیل می‌شود (نامِ دسته نمی‌تواند خالی باشد).
CREATE TEMP TABLE "_misc_income_keys" AS
SELECT k.id, k.market_id, k.created_at, k.name,
       lower(translate(regexp_replace(k.name, '[\s‌‍]+', '', 'g'), 'يك', 'یک')) AS name_key
FROM (
    SELECT i.id, i.market_id, i.created_at,
           COALESCE(NULLIF(btrim(regexp_replace(i.type, '\s+', ' ', 'g')), ''), 'متفرقه') AS name
    FROM "miscellaneous_income" i
) k;

INSERT INTO "miscellaneous_income_categories" ("id", "market_id", "name", "name_key", "scope_key", "parent_id", "is_active")
SELECT DISTINCT ON (market_id, name_key) gen_random_uuid(), market_id, name, name_key, market_id, NULL, true
FROM "_misc_income_keys"
ORDER BY market_id, name_key, created_at, id;

UPDATE "miscellaneous_income" i
SET "category_id" = c."id", "root_category_id" = c."id"
FROM "_misc_income_keys" k
JOIN "miscellaneous_income_categories" c
  ON c."market_id" = k.market_id AND c."name_key" = k.name_key AND c."parent_id" IS NULL
WHERE i."id" = k.id;

-- نرخ و سازنده از دفترکل (ردیف‌های قدیمی ممکن است null باشند؛ همین‌طور می‌مانند).
UPDATE "miscellaneous_income" i
SET "exchange_rate" = l."exchange_rate",
    "base_currency_amount" = l."base_currency_amount",
    "created_by_id" = l."created_by_id"
FROM "ledger_entries" l
WHERE l."miscellaneous_income_id" = i."id";

DROP TABLE "_misc_income_keys";

-- ۴) سفت‌کردن: ستون‌ها NOT NULL، ایندکس‌ها، کلیدهای خارجی ------------------------------------------
ALTER TABLE "miscellaneous_income"
    ALTER COLUMN "category_id" SET NOT NULL,
    ALTER COLUMN "root_category_id" SET NOT NULL;

DROP INDEX "miscellaneous_income_market_id_idx";

CREATE INDEX "miscellaneous_income_market_id_date_idx" ON "miscellaneous_income"("market_id", "date");

CREATE INDEX "miscellaneous_income_market_id_root_category_id_date_idx" ON "miscellaneous_income"("market_id", "root_category_id", "date");

CREATE INDEX "miscellaneous_income_category_id_idx" ON "miscellaneous_income"("category_id");

ALTER TABLE "miscellaneous_income" ADD CONSTRAINT "miscellaneous_income_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "miscellaneous_income_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "miscellaneous_income" ADD CONSTRAINT "miscellaneous_income_root_category_id_fkey" FOREIGN KEY ("root_category_id") REFERENCES "miscellaneous_income_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "miscellaneous_income" ADD CONSTRAINT "miscellaneous_income_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
