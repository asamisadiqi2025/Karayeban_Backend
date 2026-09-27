-- DropIndex
-- قید یکتاییِ قبلی روی (market_id, name) شاملِ گدام‌های حذف‌شده (is_deleted=true) هم می‌شد،
-- پس نامِ یک گدامِ حذف‌شده برای همیشه غیرقابل‌استفادهٔ مجدد می‌ماند.
DROP INDEX "warehouses_market_id_name_key";

-- CreateIndex
-- یکتاییِ نام فقط بین گدام‌های فعال (is_deleted=false) اعمال می‌شود؛ گدامِ حذف‌شده
-- دیگر مانع ساختِ گدامِ جدید با همان نام نیست.
CREATE UNIQUE INDEX "warehouses_market_id_name_active_key" ON "warehouses"("market_id", "name") WHERE "is_deleted" = false;

-- CreateIndex
CREATE INDEX "warehouses_market_id_name_idx" ON "warehouses"("market_id", "name");
