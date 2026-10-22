-- CreateEnum
CREATE TYPE "DebtPromiseStatus" AS ENUM ('OPEN', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DebtPromiseSource" AS ENUM ('TERMINATE', 'RENEW', 'MANUAL');

-- CreateTable
CREATE TABLE "debt_promises" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "contract_id" UUID,
    "source" "DebtPromiseSource" NOT NULL,
    "status" "DebtPromiseStatus" NOT NULL DEFAULT 'OPEN',
    "promised_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "rent_charge_ids" UUID[],
    "electricity_bill_ids" UUID[],
    "snapshot" JSONB NOT NULL,
    "reschedule_count" INTEGER NOT NULL DEFAULT 0,
    "fulfilled_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "debt_promises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "debt_promises_market_id_status_promised_date_idx" ON "debt_promises"("market_id", "status", "promised_date");

-- CreateIndex
CREATE INDEX "debt_promises_tenant_id_status_idx" ON "debt_promises"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "debt_promises" ADD CONSTRAINT "debt_promises_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_promises" ADD CONSTRAINT "debt_promises_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_promises" ADD CONSTRAINT "debt_promises_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_promises" ADD CONSTRAINT "debt_promises_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
