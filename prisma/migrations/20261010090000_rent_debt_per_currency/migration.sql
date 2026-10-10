-- RentDebt: از «یک ردیف برای هر مستأجر» به «یک ردیف برای هر مستأجر در هر ارز».
-- کرایه به ارزِ قرارداد است؛ جمعِ ارزهای مختلف در یک عدد بی‌معنی بود. RentDebt یک کشِ مشتق از rent_charges
-- است (RentService.recomputeRentDebt آن را بازمی‌سازد)، و فیلدهای دستی (notes, risk_score) حفظ می‌شوند.

-- 1) ستون، ابتدا nullable (جدول ردیف دارد؛ NOT NULL مستقیم شکست می‌خورد)
ALTER TABLE "rent_debts" ADD COLUMN "currency_id" UUID;

-- 2) پر کردنِ ردیف‌های موجود: ارزِ جدیدترین فاکتورِ «باز» همان مستأجر؛ وگرنه جدیدترین فاکتور؛ وگرنه ارزِ پایهٔ
--    بازار؛ وگرنه اولین ارزِ فعالِ بازار. (برای مستأجرِ تک‌ارزی که همهٔ دادهٔ امروز است، دقیقاً ارزِ درست است.)
UPDATE "rent_debts" d
SET "currency_id" = COALESCE(
  (SELECT c."currency_id" FROM "rent_charges" c
    WHERE c."tenant_id" = d."tenant_id" AND c."status" IN ('PENDING', 'PARTIAL', 'OVERDUE')
    ORDER BY c."period_start" DESC LIMIT 1),
  (SELECT c."currency_id" FROM "rent_charges" c
    WHERE c."tenant_id" = d."tenant_id"
    ORDER BY c."period_start" DESC LIMIT 1),
  (SELECT m."base_currency_id" FROM "tenants" t JOIN "markets" m ON m."id" = t."market_id"
    WHERE t."id" = d."tenant_id"),
  (SELECT mc."currency_id" FROM "tenants" t JOIN "market_currencies" mc ON mc."market_id" = t."market_id"
    WHERE t."id" = d."tenant_id" ORDER BY mc."created_at" LIMIT 1)
);

-- 3) ردیفی که هیچ ارزی برایش پیدا نشد (مستأجرِ بدونِ فاکتور در بازارِ بدونِ ارز) اطلاعاتی ندارد (کشِ صفر).
DELETE FROM "rent_debts" WHERE "currency_id" IS NULL;

-- 4) قیدها
ALTER TABLE "rent_debts" ALTER COLUMN "currency_id" SET NOT NULL;

-- DropIndex
DROP INDEX "rent_debts_tenant_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "rent_debts_tenant_id_currency_id_key" ON "rent_debts"("tenant_id", "currency_id");

-- AddForeignKey
ALTER TABLE "rent_debts" ADD CONSTRAINT "rent_debts_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
