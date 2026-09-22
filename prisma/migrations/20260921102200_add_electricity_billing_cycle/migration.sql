-- AlterTable
ALTER TABLE "electricity_bills" ADD COLUMN     "billing_cycle_id" UUID,
ADD COLUMN     "contract_id" UUID,
ADD COLUMN     "period_number" INTEGER,
ADD COLUMN     "year" INTEGER;

-- CreateTable
CREATE TABLE "electricity_billing_cycles" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "months_per_period" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "electricity_billing_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "electricity_billing_cycles_market_id_year_key" ON "electricity_billing_cycles"("market_id", "year");

-- CreateIndex
CREATE INDEX "electricity_bills_contract_id_idx" ON "electricity_bills"("contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "electricity_bills_contract_id_year_period_number_key" ON "electricity_bills"("contract_id", "year", "period_number");

-- AddForeignKey
ALTER TABLE "electricity_billing_cycles" ADD CONSTRAINT "electricity_billing_cycles_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electricity_bills" ADD CONSTRAINT "electricity_bills_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electricity_bills" ADD CONSTRAINT "electricity_bills_billing_cycle_id_fkey" FOREIGN KEY ("billing_cycle_id") REFERENCES "electricity_billing_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

