-- کنتور: یکتاییِ «دوکان» و «شمارهٔ کنتور» فقط بینِ کنتورهای فعال.
-- قبلاً shop_id و (market_id, meter_number) روی «همهٔ» کنتورها یکتا بود، پس با غیرفعال‌کردنِ کنتورِ خراب،
-- دوکانش برای کنتورِ جدید آزاد نمی‌شد (۴۰۹ «دوکان از قبل یک کنتور دارد»). حالا کنتورِ قدیمی غیرفعال می‌ماند
-- (با سابقهٔ کاملِ بل‌ها) و کنتورِ جدید برای همان دوکان ساخته می‌شود. سریالِ دستگاه همچنان در کلِ بازار یکتاست.
-- داده‌های موجود (که قبلاً روی همهٔ کنتورها یکتا بودند) روی زیرمجموعهٔ فعال هم یکتا هستند، پس این migration نمی‌شکند.
-- همان الگوی ایندکسِ شرطیِ warehouses_market_id_name_active_key.

-- قیدِ قبلی: shop_id در دیتابیس یک CONSTRAINT است (با DROP INDEX پاک نمی‌شود) و market_id+meter_number یک ایندکسِ
-- یکتاست؛ هر دو حالت (CONSTRAINT یا INDEX) پوشش داده می‌شود تا روی هر محیطی (توسعه/سرور) بی‌خطا اجرا شود.
ALTER TABLE "electricity_meters" DROP CONSTRAINT IF EXISTS "electricity_meters_shop_id_key";
DROP INDEX IF EXISTS "electricity_meters_shop_id_key";
ALTER TABLE "electricity_meters" DROP CONSTRAINT IF EXISTS "electricity_meters_market_id_meter_number_key";
DROP INDEX IF EXISTS "electricity_meters_market_id_meter_number_key";

-- CreateIndex
CREATE UNIQUE INDEX "electricity_meters_shop_id_active_key" ON "electricity_meters"("shop_id") WHERE "status" = 'active';

-- CreateIndex
CREATE UNIQUE INDEX "electricity_meters_market_id_meter_number_active_key" ON "electricity_meters"("market_id", "meter_number") WHERE "status" = 'active';
