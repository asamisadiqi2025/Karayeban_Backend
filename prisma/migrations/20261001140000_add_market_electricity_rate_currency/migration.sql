-- AlterTable
ALTER TABLE "markets" ADD COLUMN     "electricity_rate_currency_id" UUID;

-- AddForeignKey
ALTER TABLE "markets" ADD CONSTRAINT "markets_electricity_rate_currency_id_fkey" FOREIGN KEY ("electricity_rate_currency_id") REFERENCES "Currency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
