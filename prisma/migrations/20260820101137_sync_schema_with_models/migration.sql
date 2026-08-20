-- CreateEnum
CREATE TYPE "CollateralStatus" AS ENUM ('HELD', 'RETURNED', 'SOLD');

-- CreateEnum
CREATE TYPE "SettlementMethod" AS ENUM ('CASH', 'COLLATERAL', 'WRITE_OFF', 'MIXED');

-- CreateEnum
CREATE TYPE "ElectricityBillStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "LotteryDrawStatus" AS ENUM ('OPEN', 'CLOSED', 'DRAWN');

-- CreateEnum
CREATE TYPE "ShareholderTransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- AlterEnum
BEGIN;
CREATE TYPE "ShopStatus_new" AS ENUM ('active', 'inactive', 'empty', 'rented');
ALTER TABLE "shops" ALTER COLUMN "status" TYPE "ShopStatus_new" USING ("status"::text::"ShopStatus_new");
ALTER TYPE "ShopStatus" RENAME TO "ShopStatus_old";
ALTER TYPE "ShopStatus_new" RENAME TO "ShopStatus";
DROP TYPE "public"."ShopStatus_old";
COMMIT;

-- AlterEnum
ALTER TYPE "ShopType" ADD VALUE 'stall';

-- DropForeignKey
ALTER TABLE "ElectricityBill" DROP CONSTRAINT "ElectricityBill_shop_id_fkey";

-- DropForeignKey
ALTER TABLE "ElectricityDebt" DROP CONSTRAINT "ElectricityDebt_shop_id_fkey";

-- DropForeignKey
ALTER TABLE "ElectricityPayment" DROP CONSTRAINT "ElectricityPayment_fund_id_fkey";

-- DropForeignKey
ALTER TABLE "ShareholderTransaction" DROP CONSTRAINT "ShareholderTransaction_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "ShareholderTransaction" DROP CONSTRAINT "ShareholderTransaction_fund_id_fkey";

-- DropForeignKey
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_fund_id_fkey";

-- DropForeignKey
ALTER TABLE "funds" DROP CONSTRAINT "funds_market_id_fkey";

-- DropForeignKey
ALTER TABLE "miscellaneous_income" DROP CONSTRAINT "miscellaneous_income_fund_id_fkey";

-- DropForeignKey
ALTER TABLE "rent_charges" DROP CONSTRAINT "rent_charges_fund_id_fkey";

-- DropForeignKey
ALTER TABLE "rent_payments" DROP CONSTRAINT "rent_payments_fund_id_fkey";

-- DropForeignKey
ALTER TABLE "rent_payments" DROP CONSTRAINT "rent_payments_rent_charge_id_fkey";

-- DropIndex
DROP INDEX "expenses_fund_id_idx";

-- DropIndex
DROP INDEX "miscellaneous_income_fund_id_idx";

-- AlterTable
ALTER TABLE "ElectricityMeter" ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "market_id" UUID NOT NULL,
ADD COLUMN     "meter_number" TEXT,
ADD COLUMN     "status" "MeterStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL;

-- AlterTable
ALTER TABLE "ExpenseCategory" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "assets" DROP COLUMN "currency",
ADD COLUMN     "currency_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "renewed_from_contract_id" UUID;

-- AlterTable
ALTER TABLE "expenses" DROP COLUMN "currency",
DROP COLUMN "fund_id",
ADD COLUMN     "account_id" UUID NOT NULL,
ADD COLUMN     "currency_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "markets" DROP COLUMN "baseCurrency",
DROP COLUMN "exchangeRate",
ADD COLUMN     "base_currency_id" UUID;

-- AlterTable
ALTER TABLE "miscellaneous_income" DROP COLUMN "currency",
DROP COLUMN "fund_id",
ADD COLUMN     "account_id" UUID NOT NULL,
ADD COLUMN     "currency_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "rent_charges" DROP COLUMN "currency",
DROP COLUMN "fund_id",
ADD COLUMN     "account_id" UUID,
ADD COLUMN     "currency_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "rent_payments" DROP COLUMN "currency",
DROP COLUMN "fund_id",
DROP COLUMN "rent_charge_id",
ADD COLUMN     "account_id" UUID NOT NULL,
ADD COLUMN     "currency_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "shop_groups" ADD COLUMN     "contract_id" UUID;

-- AlterTable
ALTER TABLE "shops" ALTER COLUMN "type" SET NOT NULL,
ALTER COLUMN "type" SET DEFAULT 'shop',
ALTER COLUMN "status" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'empty';

-- DropTable
DROP TABLE "ElectricityBill";

-- DropTable
DROP TABLE "ElectricityDebt";

-- DropTable
DROP TABLE "ElectricityPayment";

-- DropTable
DROP TABLE "ShareholderTransaction";

-- DropTable
DROP TABLE "funds";

-- CreateTable
CREATE TABLE "account_transfers" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "from_account_id" UUID NOT NULL,
    "to_account_id" UUID NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "transfer_date" TIMESTAMPTZ(6) NOT NULL,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collateral_items" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "contract_id" UUID,
    "description" TEXT NOT NULL,
    "estimated_value" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'AFN',
    "received_date" TIMESTAMPTZ(6) NOT NULL,
    "status" "CollateralStatus" NOT NULL DEFAULT 'HELD',
    "returned_date" TIMESTAMPTZ(6),
    "sold_date" TIMESTAMPTZ(6),
    "sold_amount" DECIMAL(15,2),
    "sold_to_description" TEXT,
    "applied_to_debt_amount" DECIMAL(15,2),
    "account_id" UUID,
    "settlement_id" UUID,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "collateral_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_settlements" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "final_rent_debt" DECIMAL(18,2) NOT NULL,
    "final_electricity_debt" DECIMAL(15,2) NOT NULL,
    "settlement_method" "SettlementMethod" NOT NULL,
    "settled_amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'AFN',
    "notes" TEXT,
    "approved_by_id" UUID,
    "settled_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_shops" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),

    CONSTRAINT "contract_shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "currency_id" UUID NOT NULL,
    "rate_to_base" DECIMAL(18,6) NOT NULL,
    "effective_date" DATE NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "electricity_bills" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "meter_id" UUID,
    "tenant_id" UUID,
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "period_end" TIMESTAMPTZ(6) NOT NULL,
    "previous_reading" DECIMAL(12,2),
    "current_reading" DECIMAL(12,2),
    "total_amount" DECIMAL(15,2) NOT NULL,
    "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "remaining_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'AFN',
    "status" "ElectricityBillStatus" NOT NULL DEFAULT 'PENDING',
    "is_opening_entry" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "electricity_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "electricity_debts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "total_debt" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "last_bill_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "last_payment_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "last_bill_date" TIMESTAMPTZ(6),
    "last_payment_date" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "electricity_debts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "electricity_payments" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'AFN',
    "payment_date" TIMESTAMPTZ(6) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "account_id" UUID,
    "collected_by_id" UUID,
    "receipt_number" VARCHAR(100),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "electricity_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "electricity_payment_allocations" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "bill_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "electricity_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lottery_draws" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "title" VARCHAR(150),
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "period_end" TIMESTAMPTZ(6) NOT NULL,
    "ticket_threshold_amount" DECIMAL(15,2) NOT NULL,
    "status" "LotteryDrawStatus" NOT NULL DEFAULT 'OPEN',
    "drawn_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lottery_draws_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lottery_entries" (
    "id" UUID NOT NULL,
    "draw_id" UUID NOT NULL,
    "shop_id" UUID,
    "buyer_name" VARCHAR(150) NOT NULL,
    "buyer_contact" VARCHAR(30),
    "purchase_amount" DECIMAL(15,2) NOT NULL,
    "ticket_count" INTEGER NOT NULL,
    "ticket_number" VARCHAR(50),
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_by_id" UUID,

    CONSTRAINT "lottery_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lottery_prizes" (
    "id" UUID NOT NULL,
    "draw_id" UUID NOT NULL,
    "winner_entry_id" UUID,
    "description" TEXT NOT NULL,
    "cost" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'AFN',
    "awarded_at" TIMESTAMPTZ(6),
    "expense_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lottery_prizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rent_payment_allocations" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "rent_charge_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rent_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shareholders" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "contact" VARCHAR(30),
    "id_number" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shareholders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shareholder_equity_history" (
    "id" UUID NOT NULL,
    "shareholder_id" UUID NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shareholder_equity_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shareholder_transactions" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "shareholder_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "type" "ShareholderTransactionType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "transaction_date" TIMESTAMPTZ(6) NOT NULL,
    "receipt_number" VARCHAR(100),
    "details" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shareholder_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_transfers_market_id_idx" ON "account_transfers"("market_id");

-- CreateIndex
CREATE INDEX "account_transfers_from_account_id_idx" ON "account_transfers"("from_account_id");

-- CreateIndex
CREATE INDEX "account_transfers_to_account_id_idx" ON "account_transfers"("to_account_id");

-- CreateIndex
CREATE INDEX "collateral_items_market_id_idx" ON "collateral_items"("market_id");

-- CreateIndex
CREATE INDEX "collateral_items_tenant_id_idx" ON "collateral_items"("tenant_id");

-- CreateIndex
CREATE INDEX "collateral_items_status_idx" ON "collateral_items"("status");

-- CreateIndex
CREATE UNIQUE INDEX "contract_settlements_contract_id_key" ON "contract_settlements"("contract_id");

-- CreateIndex
CREATE INDEX "contract_shops_contract_id_idx" ON "contract_shops"("contract_id");

-- CreateIndex
CREATE INDEX "contract_shops_shop_id_idx" ON "contract_shops"("shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_shops_contract_id_shop_id_key" ON "contract_shops"("contract_id", "shop_id");

-- CreateIndex
CREATE INDEX "exchange_rates_market_id_idx" ON "exchange_rates"("market_id");

-- CreateIndex
CREATE INDEX "exchange_rates_currency_id_effective_date_idx" ON "exchange_rates"("currency_id", "effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_market_id_currency_id_effective_date_key" ON "exchange_rates"("market_id", "currency_id", "effective_date");

-- CreateIndex
CREATE INDEX "electricity_bills_market_id_idx" ON "electricity_bills"("market_id");

-- CreateIndex
CREATE INDEX "electricity_bills_shop_id_idx" ON "electricity_bills"("shop_id");

-- CreateIndex
CREATE INDEX "electricity_bills_tenant_id_idx" ON "electricity_bills"("tenant_id");

-- CreateIndex
CREATE INDEX "electricity_bills_status_idx" ON "electricity_bills"("status");

-- CreateIndex
CREATE INDEX "electricity_bills_period_start_period_end_idx" ON "electricity_bills"("period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "electricity_debts_tenant_id_key" ON "electricity_debts"("tenant_id");

-- CreateIndex
CREATE INDEX "electricity_payments_market_id_idx" ON "electricity_payments"("market_id");

-- CreateIndex
CREATE INDEX "electricity_payments_shop_id_idx" ON "electricity_payments"("shop_id");

-- CreateIndex
CREATE INDEX "electricity_payments_tenant_id_idx" ON "electricity_payments"("tenant_id");

-- CreateIndex
CREATE INDEX "electricity_payment_allocations_payment_id_idx" ON "electricity_payment_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "electricity_payment_allocations_bill_id_idx" ON "electricity_payment_allocations"("bill_id");

-- CreateIndex
CREATE UNIQUE INDEX "electricity_payment_allocations_payment_id_bill_id_key" ON "electricity_payment_allocations"("payment_id", "bill_id");

-- CreateIndex
CREATE INDEX "lottery_draws_market_id_idx" ON "lottery_draws"("market_id");

-- CreateIndex
CREATE INDEX "lottery_entries_draw_id_idx" ON "lottery_entries"("draw_id");

-- CreateIndex
CREATE INDEX "lottery_entries_shop_id_idx" ON "lottery_entries"("shop_id");

-- CreateIndex
CREATE INDEX "lottery_prizes_draw_id_idx" ON "lottery_prizes"("draw_id");

-- CreateIndex
CREATE INDEX "rent_payment_allocations_payment_id_idx" ON "rent_payment_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "rent_payment_allocations_rent_charge_id_idx" ON "rent_payment_allocations"("rent_charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "rent_payment_allocations_payment_id_rent_charge_id_key" ON "rent_payment_allocations"("payment_id", "rent_charge_id");

-- CreateIndex
CREATE INDEX "shareholders_market_id_idx" ON "shareholders"("market_id");

-- CreateIndex
CREATE INDEX "shareholder_equity_history_shareholder_id_effective_from_idx" ON "shareholder_equity_history"("shareholder_id", "effective_from");

-- CreateIndex
CREATE INDEX "shareholder_transactions_market_id_idx" ON "shareholder_transactions"("market_id");

-- CreateIndex
CREATE INDEX "shareholder_transactions_shareholder_id_idx" ON "shareholder_transactions"("shareholder_id");

-- CreateIndex
CREATE INDEX "shareholder_transactions_account_id_idx" ON "shareholder_transactions"("account_id");

-- CreateIndex
CREATE INDEX "ElectricityMeter_shop_id_idx" ON "ElectricityMeter"("shop_id");

-- CreateIndex
CREATE INDEX "ElectricityMeter_status_idx" ON "ElectricityMeter"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ElectricityMeter_market_id_meter_number_key" ON "ElectricityMeter"("market_id", "meter_number");

-- CreateIndex
CREATE INDEX "ExpenseCategory_market_id_idx" ON "ExpenseCategory"("market_id");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_renewed_from_contract_id_key" ON "contracts"("renewed_from_contract_id");

-- CreateIndex
CREATE INDEX "expenses_account_id_idx" ON "expenses"("account_id");

-- CreateIndex
CREATE INDEX "miscellaneous_income_account_id_idx" ON "miscellaneous_income"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "rent_debts_tenant_id_key" ON "rent_debts"("tenant_id");

-- CreateIndex
CREATE INDEX "shop_groups_contract_id_idx" ON "shop_groups"("contract_id");

-- AddForeignKey
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collateral_items" ADD CONSTRAINT "collateral_items_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collateral_items" ADD CONSTRAINT "collateral_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collateral_items" ADD CONSTRAINT "collateral_items_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collateral_items" ADD CONSTRAINT "collateral_items_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collateral_items" ADD CONSTRAINT "collateral_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collateral_items" ADD CONSTRAINT "collateral_items_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "contract_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_settlements" ADD CONSTRAINT "contract_settlements_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_settlements" ADD CONSTRAINT "contract_settlements_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_renewed_from_contract_id_fkey" FOREIGN KEY ("renewed_from_contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_shops" ADD CONSTRAINT "contract_shops_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_shops" ADD CONSTRAINT "contract_shops_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectricityMeter" ADD CONSTRAINT "ElectricityMeter_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electricity_bills" ADD CONSTRAINT "electricity_bills_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electricity_bills" ADD CONSTRAINT "electricity_bills_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electricity_bills" ADD CONSTRAINT "electricity_bills_meter_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "ElectricityMeter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electricity_bills" ADD CONSTRAINT "electricity_bills_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electricity_bills" ADD CONSTRAINT "electricity_bills_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electricity_debts" ADD CONSTRAINT "electricity_debts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electricity_payments" ADD CONSTRAINT "electricity_payments_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electricity_payments" ADD CONSTRAINT "electricity_payments_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electricity_payments" ADD CONSTRAINT "electricity_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electricity_payments" ADD CONSTRAINT "electricity_payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electricity_payments" ADD CONSTRAINT "electricity_payments_collected_by_id_fkey" FOREIGN KEY ("collected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electricity_payment_allocations" ADD CONSTRAINT "electricity_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "electricity_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electricity_payment_allocations" ADD CONSTRAINT "electricity_payment_allocations_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "electricity_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_draws" ADD CONSTRAINT "lottery_draws_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_entries" ADD CONSTRAINT "lottery_entries_draw_id_fkey" FOREIGN KEY ("draw_id") REFERENCES "lottery_draws"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_entries" ADD CONSTRAINT "lottery_entries_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_entries" ADD CONSTRAINT "lottery_entries_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_prizes" ADD CONSTRAINT "lottery_prizes_draw_id_fkey" FOREIGN KEY ("draw_id") REFERENCES "lottery_draws"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_prizes" ADD CONSTRAINT "lottery_prizes_winner_entry_id_fkey" FOREIGN KEY ("winner_entry_id") REFERENCES "lottery_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_prizes" ADD CONSTRAINT "lottery_prizes_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "markets" ADD CONSTRAINT "markets_base_currency_id_fkey" FOREIGN KEY ("base_currency_id") REFERENCES "Currency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miscellaneous_income" ADD CONSTRAINT "miscellaneous_income_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miscellaneous_income" ADD CONSTRAINT "miscellaneous_income_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_charges" ADD CONSTRAINT "rent_charges_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_charges" ADD CONSTRAINT "rent_charges_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_payment_allocations" ADD CONSTRAINT "rent_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "rent_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_payment_allocations" ADD CONSTRAINT "rent_payment_allocations_rent_charge_id_fkey" FOREIGN KEY ("rent_charge_id") REFERENCES "rent_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shareholders" ADD CONSTRAINT "shareholders_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shareholder_equity_history" ADD CONSTRAINT "shareholder_equity_history_shareholder_id_fkey" FOREIGN KEY ("shareholder_id") REFERENCES "shareholders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shareholder_equity_history" ADD CONSTRAINT "shareholder_equity_history_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shareholder_transactions" ADD CONSTRAINT "shareholder_transactions_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shareholder_transactions" ADD CONSTRAINT "shareholder_transactions_shareholder_id_fkey" FOREIGN KEY ("shareholder_id") REFERENCES "shareholders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shareholder_transactions" ADD CONSTRAINT "shareholder_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shareholder_transactions" ADD CONSTRAINT "shareholder_transactions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_groups" ADD CONSTRAINT "shop_groups_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

