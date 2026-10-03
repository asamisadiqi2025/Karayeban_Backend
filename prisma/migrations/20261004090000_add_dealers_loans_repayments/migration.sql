
-- CreateEnum
CREATE TYPE "DealerType" AS ENUM ('EMPLOYEE', 'OTHER');

-- CreateEnum
CREATE TYPE "DealerLoanStatus" AS ENUM ('OPEN', 'SETTLED');

-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN     "dealer_loan_id" UUID,
ADD COLUMN     "dealer_repayment_id" UUID;

-- CreateTable
CREATE TABLE "dealers" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "father_name" VARCHAR(100),
    "grandfather_name" VARCHAR(100),
    "type" "DealerType" NOT NULL DEFAULT 'EMPLOYEE',
    "id_number" VARCHAR(50),
    "contact" VARCHAR(30),
    "details" TEXT,
    "credit_limit" DECIMAL(18,4),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dealers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_loans" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "dealer_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "currency_id" UUID NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "repaid_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "remaining_amount" DECIMAL(18,4) NOT NULL,
    "status" "DealerLoanStatus" NOT NULL DEFAULT 'OPEN',
    "loan_date" TIMESTAMPTZ(6) NOT NULL,
    "due_date" DATE,
    "exchange_rate" DECIMAL(24,10),
    "base_currency_amount" DECIMAL(18,4),
    "details" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dealer_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_repayments" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "repayment_date" TIMESTAMPTZ(6) NOT NULL,
    "exchange_rate" DECIMAL(24,10),
    "base_currency_amount" DECIMAL(18,4),
    "details" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dealer_repayments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dealers_market_id_idx" ON "dealers"("market_id");

-- CreateIndex
CREATE UNIQUE INDEX "dealers_market_id_id_number_key" ON "dealers"("market_id", "id_number");

-- CreateIndex
CREATE INDEX "dealer_loans_market_id_idx" ON "dealer_loans"("market_id");

-- CreateIndex
CREATE INDEX "dealer_loans_dealer_id_idx" ON "dealer_loans"("dealer_id");

-- CreateIndex
CREATE INDEX "dealer_loans_status_due_date_idx" ON "dealer_loans"("status", "due_date");

-- CreateIndex
CREATE INDEX "dealer_repayments_market_id_idx" ON "dealer_repayments"("market_id");

-- CreateIndex
CREATE INDEX "dealer_repayments_loan_id_idx" ON "dealer_repayments"("loan_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_dealer_loan_id_key" ON "ledger_entries"("dealer_loan_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_dealer_repayment_id_key" ON "ledger_entries"("dealer_repayment_id");

-- AddForeignKey
ALTER TABLE "dealers" ADD CONSTRAINT "dealers_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_loans" ADD CONSTRAINT "dealer_loans_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_loans" ADD CONSTRAINT "dealer_loans_dealer_id_fkey" FOREIGN KEY ("dealer_id") REFERENCES "dealers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_loans" ADD CONSTRAINT "dealer_loans_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_loans" ADD CONSTRAINT "dealer_loans_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_loans" ADD CONSTRAINT "dealer_loans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_repayments" ADD CONSTRAINT "dealer_repayments_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_repayments" ADD CONSTRAINT "dealer_repayments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "dealer_loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_repayments" ADD CONSTRAINT "dealer_repayments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_repayments" ADD CONSTRAINT "dealer_repayments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_dealer_loan_id_fkey" FOREIGN KEY ("dealer_loan_id") REFERENCES "dealer_loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_dealer_repayment_id_fkey" FOREIGN KEY ("dealer_repayment_id") REFERENCES "dealer_repayments"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Safety nets (فرض‌های مالی که حتی اگر سرویس اشتباه کند دیتابیس نگه می‌دارد)
ALTER TABLE "dealer_loans" ADD CONSTRAINT "dealer_loans_amounts_check" CHECK ("amount" > 0 AND "repaid_amount" >= 0 AND "remaining_amount" >= 0 AND "repaid_amount" + "remaining_amount" = "amount");
ALTER TABLE "dealer_repayments" ADD CONSTRAINT "dealer_repayments_amount_check" CHECK ("amount" > 0);
ALTER TABLE "dealers" ADD CONSTRAINT "dealers_credit_limit_check" CHECK ("credit_limit" IS NULL OR "credit_limit" >= 0);
