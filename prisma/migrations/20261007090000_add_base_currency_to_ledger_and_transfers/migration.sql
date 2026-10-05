
-- AlterTable
ALTER TABLE "account_transfers" ADD COLUMN     "base_currency_amount" DECIMAL(18,4),
ADD COLUMN     "from_rate_to_base" DECIMAL(24,10),
ADD COLUMN     "received_base_currency_amount" DECIMAL(18,4),
ADD COLUMN     "to_rate_to_base" DECIMAL(24,10);

-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN     "base_currency_amount" DECIMAL(18,4),
ADD COLUMN     "exchange_rate" DECIMAL(24,10);

