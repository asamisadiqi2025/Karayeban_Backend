/*
  Warnings:

  - You are about to drop the column `currency` on the `collateral_items` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `contract_settlements` table. All the data in the column will be lost.
  - You are about to alter the column `final_rent_debt` on the `contract_settlements` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(18,4)`.
  - You are about to alter the column `settled_amount` on the `contract_settlements` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(18,4)`.
  - You are about to alter the column `rent` on the `contracts` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(18,4)`.
  - You are about to drop the column `currency` on the `electricity_bills` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `electricity_payments` table. All the data in the column will be lost.
  - You are about to alter the column `amount` on the `expenses` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(18,4)`.
  - You are about to alter the column `usd_equivalent` on the `expenses` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(18,4)`.
  - You are about to drop the column `currency` on the `lottery_prizes` table. All the data in the column will be lost.
  - You are about to alter the column `amount` on the `miscellaneous_income` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(18,4)`.
  - You are about to alter the column `total_debt` on the `rent_debts` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(18,4)`.
  - You are about to alter the column `overdue_debt` on the `rent_debts` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(18,4)`.
  - You are about to alter the column `last_charge_amount` on the `rent_debts` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(18,4)`.
  - You are about to alter the column `last_payment_amount` on the `rent_debts` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(18,4)`.
  - You are about to alter the column `amount` on the `rent_payment_allocations` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(18,4)`.
  - You are about to alter the column `amount` on the `rent_payments` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(18,4)`.
  - You are about to alter the column `usd_equivalent` on the `rent_payments` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(18,4)`.
  - You are about to alter the column `amount` on the `shareholder_transactions` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(18,4)`.
  - You are about to drop the `OverdueDebt` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `currency_id` to the `collateral_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `currency_id` to the `contract_settlements` table without a default value. This is not possible if the table is not empty.
  - Added the required column `currency_id` to the `electricity_bills` table without a default value. This is not possible if the table is not empty.
  - Added the required column `currency_id` to the `electricity_payments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `currency_id` to the `lottery_prizes` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('IN', 'OUT');

-- DropForeignKey
ALTER TABLE "OverdueDebt" DROP CONSTRAINT "OverdueDebt_shop_id_fkey";

-- DropForeignKey
ALTER TABLE "OverdueDebt" DROP CONSTRAINT "OverdueDebt_tenant_id_fkey";

-- AlterTable
ALTER TABLE "assets" ALTER COLUMN "purchase_price" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "annual_depreciation" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "current_book_value" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "collateral_items" DROP COLUMN "currency",
ADD COLUMN     "currency_id" UUID NOT NULL,
ALTER COLUMN "estimated_value" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "sold_amount" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "applied_to_debt_amount" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "contract_settlements" DROP COLUMN "currency",
ADD COLUMN     "currency_id" UUID NOT NULL,
ALTER COLUMN "final_rent_debt" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "final_electricity_debt" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "settled_amount" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "contracts" ALTER COLUMN "rent" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "depreciation_events" ALTER COLUMN "depreciation_amount" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "book_value_before" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "book_value_after" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "electricity_bills" DROP COLUMN "currency",
ADD COLUMN     "currency_id" UUID NOT NULL,
ALTER COLUMN "total_amount" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "paid_amount" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "remaining_amount" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "electricity_debts" ALTER COLUMN "total_debt" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "last_bill_amount" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "last_payment_amount" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "electricity_payment_allocations" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "electricity_payments" DROP COLUMN "currency",
ADD COLUMN     "currency_id" UUID NOT NULL,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "expenses" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "usd_equivalent" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "lottery_draws" ALTER COLUMN "ticket_threshold_amount" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "lottery_entries" ALTER COLUMN "purchase_amount" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "lottery_prizes" DROP COLUMN "currency",
ADD COLUMN     "currency_id" UUID NOT NULL,
ALTER COLUMN "cost" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "miscellaneous_income" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "rent_charges" ALTER COLUMN "daily_rate" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "gross_amount" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "discount_amount" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "net_amount" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "paid_amount" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "remaining_amount" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "rent_debts" ALTER COLUMN "total_debt" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "overdue_debt" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "last_charge_amount" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "last_payment_amount" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "rent_payment_allocations" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "rent_payments" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "usd_equivalent" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "shareholder_transactions" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,4);

-- DropTable
DROP TABLE "OverdueDebt";

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "currency_id" UUID NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "balance_after" DECIMAL(18,4) NOT NULL,
    "entry_date" TIMESTAMPTZ(6) NOT NULL,
    "description" TEXT,
    "rent_payment_id" UUID,
    "electricity_payment_id" UUID,
    "expense_id" UUID,
    "miscellaneous_income_id" UUID,
    "shareholder_transaction_id" UUID,
    "account_transfer_id" UUID,
    "opening_balance_id" UUID,
    "collateral_item_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_rent_payment_id_key" ON "ledger_entries"("rent_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_electricity_payment_id_key" ON "ledger_entries"("electricity_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_expense_id_key" ON "ledger_entries"("expense_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_miscellaneous_income_id_key" ON "ledger_entries"("miscellaneous_income_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_shareholder_transaction_id_key" ON "ledger_entries"("shareholder_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_opening_balance_id_key" ON "ledger_entries"("opening_balance_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_collateral_item_id_key" ON "ledger_entries"("collateral_item_id");

-- CreateIndex
CREATE INDEX "ledger_entries_market_id_idx" ON "ledger_entries"("market_id");

-- CreateIndex
CREATE INDEX "ledger_entries_account_id_entry_date_idx" ON "ledger_entries"("account_id", "entry_date");

-- CreateIndex
CREATE INDEX "ledger_entries_account_transfer_id_idx" ON "ledger_entries"("account_transfer_id");

-- AddForeignKey
ALTER TABLE "collateral_items" ADD CONSTRAINT "collateral_items_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_settlements" ADD CONSTRAINT "contract_settlements_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electricity_bills" ADD CONSTRAINT "electricity_bills_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electricity_payments" ADD CONSTRAINT "electricity_payments_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_rent_payment_id_fkey" FOREIGN KEY ("rent_payment_id") REFERENCES "rent_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_electricity_payment_id_fkey" FOREIGN KEY ("electricity_payment_id") REFERENCES "electricity_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_miscellaneous_income_id_fkey" FOREIGN KEY ("miscellaneous_income_id") REFERENCES "miscellaneous_income"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_shareholder_transaction_id_fkey" FOREIGN KEY ("shareholder_transaction_id") REFERENCES "shareholder_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_transfer_id_fkey" FOREIGN KEY ("account_transfer_id") REFERENCES "account_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_opening_balance_id_fkey" FOREIGN KEY ("opening_balance_id") REFERENCES "opening_balances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_collateral_item_id_fkey" FOREIGN KEY ("collateral_item_id") REFERENCES "collateral_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_prizes" ADD CONSTRAINT "lottery_prizes_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
