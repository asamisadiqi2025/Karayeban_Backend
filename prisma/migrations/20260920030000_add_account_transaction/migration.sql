-- CreateEnum
CREATE TYPE "AccountTransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- CreateTable
CREATE TABLE "account_transactions" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "type" "AccountTransactionType" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "transaction_date" TIMESTAMPTZ(6) NOT NULL,
    "details" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_transactions_market_id_idx" ON "account_transactions"("market_id");

-- CreateIndex
CREATE INDEX "account_transactions_account_id_idx" ON "account_transactions"("account_id");

-- AddForeignKey
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN "account_transaction_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_account_transaction_id_key" ON "ledger_entries"("account_transaction_id");

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_transaction_id_fkey" FOREIGN KEY ("account_transaction_id") REFERENCES "account_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
