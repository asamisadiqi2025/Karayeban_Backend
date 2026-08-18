-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CASH', 'BANK');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'STAFF');

-- CreateEnum
CREATE TYPE "ShopType" AS ENUM ('shop', 'kiosk', 'vendor', 'office', 'warehouse');

-- CreateEnum
CREATE TYPE "ShopStatus" AS ENUM ('empty', 'rented', 'renovation', 'free');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('draft', 'suspended', 'active', 'early_terminated', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'bank_transfer', 'cheque', 'online');

-- CreateEnum
CREATE TYPE "MeterStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('active', 'disposed');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'ACTIVATE', 'DEACTIVATE', 'TERMINATE', 'RENEW');

-- CreateEnum
CREATE TYPE "RentChargeStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('CLEAN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "currency_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "account_number" TEXT,
    "bank_name" TEXT,
    "balance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "category" VARCHAR(100),
    "purchase_price" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "lifespan_years" INTEGER NOT NULL,
    "annual_depreciation" DECIMAL(12,2) NOT NULL,
    "current_book_value" DECIMAL(12,2) NOT NULL,
    "purchase_date" TIMESTAMP(3) NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'active',
    "details" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "user_id" UUID,
    "action" "AuditAction" NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" UUID NOT NULL,
    "old_data" JSONB,
    "new_data" JSONB,
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_status_history" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "from_status" "ContractStatus",
    "to_status" "ContractStatus" NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "shop_id" UUID,
    "tenant_id" UUID,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "status" "ContractStatus" NOT NULL DEFAULT 'draft',
    "rent" DECIMAL(18,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminated_by_id" UUID,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Currency" (
    "id" UUID NOT NULL,
    "code" VARCHAR(3) NOT NULL,
    "name" TEXT,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_roles" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "market_id" UUID NOT NULL,
    "permissions" TEXT[],
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "custom_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" UUID NOT NULL,
    "market_id" UUID,
    "name" VARCHAR(255) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "usd_equivalent" DECIMAL(18,2),
    "expense_date" TIMESTAMPTZ(6) NOT NULL,
    "description" TEXT,
    "fund_id" UUID NOT NULL,
    "paid_by_id" UUID NOT NULL,
    "receipt_image" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectricityMeter" (
    "id" UUID NOT NULL,
    "serialNumber" TEXT,
    "shop_id" UUID,

    CONSTRAINT "ElectricityMeter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectricityBill" (
    "id" UUID NOT NULL,
    "amount" DECIMAL(65,30),
    "shop_id" UUID,

    CONSTRAINT "ElectricityBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectricityDebt" (
    "id" UUID NOT NULL,
    "amount" DECIMAL(65,30),
    "shop_id" UUID,

    CONSTRAINT "ElectricityDebt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectricityPayment" (
    "id" UUID NOT NULL,
    "amount" DECIMAL(65,30),
    "fund_id" UUID,

    CONSTRAINT "ElectricityPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OverdueDebt" (
    "id" UUID NOT NULL,
    "amount" DECIMAL(65,30),
    "shop_id" UUID,
    "tenant_id" UUID,

    CONSTRAINT "OverdueDebt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareholderTransaction" (
    "id" UUID NOT NULL,
    "amount" DECIMAL(65,30),
    "fund_id" UUID,
    "created_by_id" UUID,

    CONSTRAINT "ShareholderTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "depreciation_events" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "depreciation_amount" DECIMAL(12,2) NOT NULL,
    "book_value_before" DECIMAL(12,2) NOT NULL,
    "book_value_after" DECIMAL(12,2) NOT NULL,
    "applied_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "depreciation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floors" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "floor_number" INTEGER NOT NULL,
    "name" VARCHAR(100),
    "details" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funds" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "currency" VARCHAR(10),
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "funds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guarantors" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "contact" VARCHAR(30),
    "id_number" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guarantors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "markets" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "logo" TEXT,
    "address" TEXT,
    "contacts" JSONB DEFAULT '[]',
    "details" TEXT,
    "baseCurrency" VARCHAR(3) NOT NULL DEFAULT 'AFN',
    "exchangeRate" DECIMAL(10,4),
    "isSetupComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "miscellaneous_income" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "fund_id" UUID NOT NULL,
    "date" TIMESTAMPTZ(6) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "miscellaneous_income_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_balances" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "currency_id" UUID NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "exchange_rate" DECIMAL(18,6),
    "base_currency_amount" DECIMAL(18,4),
    "opening_date" DATE NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opening_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rent_charges" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "period_end" TIMESTAMPTZ(6) NOT NULL,
    "days" INTEGER NOT NULL,
    "daily_rate" DECIMAL(15,2) NOT NULL,
    "gross_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "remaining_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'AFN',
    "status" "RentChargeStatus" NOT NULL DEFAULT 'PENDING',
    "fund_id" UUID,
    "created_by_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rent_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rent_debts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "total_debt" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "overdue_debt" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "last_charge_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "last_payment_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "last_charge_date" TIMESTAMPTZ(6),
    "last_payment_date" TIMESTAMPTZ(6),
    "status" "DebtStatus" NOT NULL DEFAULT 'CLEAN',
    "risk_score" INTEGER,
    "notes" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rent_debts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rent_payments" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "usd_equivalent" DECIMAL(18,2),
    "payment_date" TIMESTAMPTZ(6) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "fund_id" UUID NOT NULL,
    "collected_by_id" UUID NOT NULL,
    "notes" TEXT,
    "is_partial" BOOLEAN NOT NULL DEFAULT false,
    "receipt_number" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rent_charge_id" UUID,

    CONSTRAINT "rent_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_groups" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "primary_meter_id" UUID,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "shop_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_group_members" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL,
    "left_at" TIMESTAMPTZ(6),

    CONSTRAINT "shop_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shops" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "floor_id" UUID,
    "shop_number" VARCHAR(50) NOT NULL,
    "area" DECIMAL(12,2),
    "location" VARCHAR(255),
    "type" "ShopType",
    "status" "ShopStatus",
    "details" TEXT,
    "current_contract_id" UUID,
    "current_tenant_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "father_name" VARCHAR(100),
    "grandfather_name" VARCHAR(100),
    "id_number" VARCHAR(50),
    "contact" VARCHAR(30),
    "gender" "Gender",
    "details" TEXT,
    "photo" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STAFF',
    "custom_role_id" UUID,
    "market_id" UUID,
    "father_name" VARCHAR(100),
    "grandfather_name" VARCHAR(100),
    "phone" VARCHAR(30),
    "tazkira_number" VARCHAR(50),
    "address" TEXT,
    "profile_photo" TEXT,
    "extra_permissions" JSONB,
    "denied_permissions" JSONB,
    "is_super_admin" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "refresh_token" TEXT,
    "refresh_token_expiry" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounts_market_id_idx" ON "accounts"("market_id");

-- CreateIndex
CREATE INDEX "accounts_currency_id_idx" ON "accounts"("currency_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_market_id_name_key" ON "accounts"("market_id", "name");

-- CreateIndex
CREATE INDEX "audit_logs_market_id_idx" ON "audit_logs"("market_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "contract_status_history_contract_id_idx" ON "contract_status_history"("contract_id");

-- CreateIndex
CREATE INDEX "contracts_market_id_idx" ON "contracts"("market_id");

-- CreateIndex
CREATE INDEX "contracts_shop_id_idx" ON "contracts"("shop_id");

-- CreateIndex
CREATE INDEX "contracts_tenant_id_idx" ON "contracts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "Currency_code_key" ON "Currency"("code");

-- CreateIndex
CREATE INDEX "custom_roles_market_id_idx" ON "custom_roles"("market_id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_roles_market_id_name_key" ON "custom_roles"("market_id", "name");

-- CreateIndex
CREATE INDEX "expenses_market_id_idx" ON "expenses"("market_id");

-- CreateIndex
CREATE INDEX "expenses_category_id_idx" ON "expenses"("category_id");

-- CreateIndex
CREATE INDEX "expenses_fund_id_idx" ON "expenses"("fund_id");

-- CreateIndex
CREATE INDEX "depreciation_events_asset_id_idx" ON "depreciation_events"("asset_id");

-- CreateIndex
CREATE INDEX "floors_market_id_idx" ON "floors"("market_id");

-- CreateIndex
CREATE UNIQUE INDEX "floors_market_id_floor_number_key" ON "floors"("market_id", "floor_number");

-- CreateIndex
CREATE INDEX "funds_market_id_idx" ON "funds"("market_id");

-- CreateIndex
CREATE INDEX "guarantors_tenant_id_idx" ON "guarantors"("tenant_id");

-- CreateIndex
CREATE INDEX "miscellaneous_income_market_id_idx" ON "miscellaneous_income"("market_id");

-- CreateIndex
CREATE INDEX "miscellaneous_income_fund_id_idx" ON "miscellaneous_income"("fund_id");

-- CreateIndex
CREATE INDEX "opening_balances_market_id_idx" ON "opening_balances"("market_id");

-- CreateIndex
CREATE INDEX "opening_balances_account_id_idx" ON "opening_balances"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "rent_charges_market_id_idx" ON "rent_charges"("market_id");

-- CreateIndex
CREATE INDEX "rent_charges_contract_id_idx" ON "rent_charges"("contract_id");

-- CreateIndex
CREATE INDEX "rent_charges_tenant_id_idx" ON "rent_charges"("tenant_id");

-- CreateIndex
CREATE INDEX "rent_charges_shop_id_idx" ON "rent_charges"("shop_id");

-- CreateIndex
CREATE INDEX "rent_charges_status_idx" ON "rent_charges"("status");

-- CreateIndex
CREATE INDEX "rent_charges_period_start_period_end_idx" ON "rent_charges"("period_start", "period_end");

-- CreateIndex
CREATE INDEX "rent_debts_tenant_id_idx" ON "rent_debts"("tenant_id");

-- CreateIndex
CREATE INDEX "rent_debts_status_idx" ON "rent_debts"("status");

-- CreateIndex
CREATE INDEX "rent_debts_updated_at_idx" ON "rent_debts"("updated_at");

-- CreateIndex
CREATE INDEX "rent_payments_market_id_idx" ON "rent_payments"("market_id");

-- CreateIndex
CREATE INDEX "rent_payments_contract_id_idx" ON "rent_payments"("contract_id");

-- CreateIndex
CREATE INDEX "rent_payments_tenant_id_idx" ON "rent_payments"("tenant_id");

-- CreateIndex
CREATE INDEX "rent_payments_shop_id_idx" ON "rent_payments"("shop_id");

-- CreateIndex
CREATE INDEX "rent_payments_year_month_idx" ON "rent_payments"("year", "month");

-- CreateIndex
CREATE INDEX "shop_groups_market_id_idx" ON "shop_groups"("market_id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_groups_primary_meter_id_key" ON "shop_groups"("primary_meter_id");

-- CreateIndex
CREATE INDEX "shop_group_members_shop_id_idx" ON "shop_group_members"("shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_group_members_group_id_shop_id_key" ON "shop_group_members"("group_id", "shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "shops_current_contract_id_key" ON "shops"("current_contract_id");

-- CreateIndex
CREATE INDEX "shops_market_id_idx" ON "shops"("market_id");

-- CreateIndex
CREATE INDEX "shops_floor_id_idx" ON "shops"("floor_id");

-- CreateIndex
CREATE UNIQUE INDEX "shops_market_id_shop_number_key" ON "shops"("market_id", "shop_number");

-- CreateIndex
CREATE INDEX "tenants_market_id_idx" ON "tenants"("market_id");

-- CreateIndex
CREATE INDEX "tenants_id_number_idx" ON "tenants"("id_number");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_tazkira_number_key" ON "users"("tazkira_number");

-- CreateIndex
CREATE INDEX "users_market_id_idx" ON "users"("market_id");

-- CreateIndex
CREATE INDEX "users_custom_role_id_idx" ON "users"("custom_role_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_status_history" ADD CONSTRAINT "contract_status_history_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_status_history" ADD CONSTRAINT "contract_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_terminated_by_id_fkey" FOREIGN KEY ("terminated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_roles" ADD CONSTRAINT "custom_roles_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_id_fkey" FOREIGN KEY ("paid_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectricityMeter" ADD CONSTRAINT "ElectricityMeter_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectricityBill" ADD CONSTRAINT "ElectricityBill_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectricityDebt" ADD CONSTRAINT "ElectricityDebt_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectricityPayment" ADD CONSTRAINT "ElectricityPayment_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverdueDebt" ADD CONSTRAINT "OverdueDebt_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverdueDebt" ADD CONSTRAINT "OverdueDebt_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareholderTransaction" ADD CONSTRAINT "ShareholderTransaction_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareholderTransaction" ADD CONSTRAINT "ShareholderTransaction_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depreciation_events" ADD CONSTRAINT "depreciation_events_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depreciation_events" ADD CONSTRAINT "depreciation_events_applied_by_id_fkey" FOREIGN KEY ("applied_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floors" ADD CONSTRAINT "floors_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funds" ADD CONSTRAINT "funds_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guarantors" ADD CONSTRAINT "guarantors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miscellaneous_income" ADD CONSTRAINT "miscellaneous_income_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miscellaneous_income" ADD CONSTRAINT "miscellaneous_income_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_charges" ADD CONSTRAINT "rent_charges_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_charges" ADD CONSTRAINT "rent_charges_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_charges" ADD CONSTRAINT "rent_charges_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_charges" ADD CONSTRAINT "rent_charges_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_charges" ADD CONSTRAINT "rent_charges_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_charges" ADD CONSTRAINT "rent_charges_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_debts" ADD CONSTRAINT "rent_debts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_collected_by_id_fkey" FOREIGN KEY ("collected_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_rent_charge_id_fkey" FOREIGN KEY ("rent_charge_id") REFERENCES "rent_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_groups" ADD CONSTRAINT "shop_groups_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_groups" ADD CONSTRAINT "shop_groups_primary_meter_id_fkey" FOREIGN KEY ("primary_meter_id") REFERENCES "ElectricityMeter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_group_members" ADD CONSTRAINT "shop_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "shop_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_group_members" ADD CONSTRAINT "shop_group_members_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_current_contract_id_fkey" FOREIGN KEY ("current_contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_current_tenant_id_fkey" FOREIGN KEY ("current_tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_custom_role_id_fkey" FOREIGN KEY ("custom_role_id") REFERENCES "custom_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
