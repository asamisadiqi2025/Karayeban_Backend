-- AlterTable
-- فقط ستون‌های nullable و بدون default: در PostgreSQL آنی است (جدول بازنویسی نمی‌شود) و ردیف‌های
-- موجود دست‌نخورده می‌مانند (null = نرخ/مصرف نامعلوم؛ عددِ حدسی ذخیره نمی‌شود).
ALTER TABLE "electricity_bills" ADD COLUMN     "rate_per_unit" DECIMAL(18,4),
ADD COLUMN     "consumed_units" DECIMAL(12,2),
ADD COLUMN     "is_manual_amount" BOOLEAN;
