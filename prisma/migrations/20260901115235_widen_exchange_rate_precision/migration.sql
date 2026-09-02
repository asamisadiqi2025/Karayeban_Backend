-- AlterTable
ALTER TABLE "account_transfers" ALTER COLUMN "exchange_rate" SET DATA TYPE DECIMAL(24,10);

-- AlterTable
ALTER TABLE "exchange_rates" ALTER COLUMN "rate_to_base" SET DATA TYPE DECIMAL(24,10);

-- AlterTable
ALTER TABLE "opening_balances" ALTER COLUMN "exchange_rate" SET DATA TYPE DECIMAL(24,10);
