-- AlterTable
ALTER TABLE "account_transactions" ADD COLUMN "exchange_rate" DECIMAL(24,10),
ADD COLUMN "base_currency_amount" DECIMAL(18,4);
