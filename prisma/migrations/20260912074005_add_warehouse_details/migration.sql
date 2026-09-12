-- DropForeignKey
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_guarantor_id_fkey";

-- DropForeignKey
ALTER TABLE "guarantors" DROP CONSTRAINT "guarantors_market_id_fkey";

-- AlterTable
ALTER TABLE "electricity_meters" RENAME CONSTRAINT "ElectricityMeter_pkey" TO "electricity_meters_pkey";

-- AlterTable
ALTER TABLE "guarantors" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "shareholders" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tenants" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "warehouses" ADD COLUMN     "details" TEXT;

-- RenameForeignKey
ALTER TABLE "electricity_meters" RENAME CONSTRAINT "ElectricityMeter_market_id_fkey" TO "electricity_meters_market_id_fkey";

-- RenameForeignKey
ALTER TABLE "electricity_meters" RENAME CONSTRAINT "ElectricityMeter_shop_id_fkey" TO "electricity_meters_shop_id_fkey";

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_guarantor_id_fkey" FOREIGN KEY ("guarantor_id") REFERENCES "guarantors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guarantors" ADD CONSTRAINT "guarantors_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ElectricityMeter_market_id_meter_number_key" RENAME TO "electricity_meters_market_id_meter_number_key";

-- RenameIndex
ALTER INDEX "ElectricityMeter_shop_id_idx" RENAME TO "electricity_meters_shop_id_idx";

-- RenameIndex
ALTER INDEX "ElectricityMeter_status_idx" RENAME TO "electricity_meters_status_idx";
