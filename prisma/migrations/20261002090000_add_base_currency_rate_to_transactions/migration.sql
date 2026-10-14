
-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "security_deposit_base_currency_amount" DECIMAL(18,4),
ADD COLUMN     "security_deposit_exchange_rate" DECIMAL(24,10);

-- AlterTable
ALTER TABLE "electricity_payments" ADD COLUMN     "base_currency_amount" DECIMAL(18,4),
ADD COLUMN     "exchange_rate" DECIMAL(24,10);

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "base_currency_amount" DECIMAL(18,4),
ADD COLUMN     "exchange_rate" DECIMAL(24,10);

-- AlterTable
ALTER TABLE "inventory_transactions" ADD COLUMN     "base_currency_amount" DECIMAL(18,4),
ADD COLUMN     "exchange_rate" DECIMAL(24,10);

-- AlterTable
ALTER TABLE "rent_payments" ADD COLUMN     "base_currency_amount" DECIMAL(18,4),
ADD COLUMN     "exchange_rate" DECIMAL(24,10);

-- AlterTable
ALTER TABLE "shareholder_transactions" ADD COLUMN     "base_currency_amount" DECIMAL(18,4),
ADD COLUMN     "exchange_rate" DECIMAL(24,10);

