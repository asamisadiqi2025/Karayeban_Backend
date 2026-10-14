-- Decouple Guarantor from Tenant entirely; make it an independent, market-scoped
-- entity. Table is empty (confirmed), so no data migration is needed.
ALTER TABLE "guarantors" DROP CONSTRAINT "guarantors_tenant_id_fkey";
DROP INDEX "guarantors_tenant_id_idx";
ALTER TABLE "guarantors" DROP COLUMN "tenant_id";

ALTER TABLE "guarantors" ADD COLUMN "market_id" UUID NOT NULL;
ALTER TABLE "guarantors" ADD COLUMN "details" TEXT;
ALTER TABLE "guarantors" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "guarantors" ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now();

ALTER TABLE "guarantors" ADD CONSTRAINT "guarantors_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE;
CREATE INDEX "guarantors_market_id_idx" ON "guarantors"("market_id");

-- Contract gets an optional link to its guarantor (this is where guarantor+tenant+shop
-- actually connect, once a contract is created).
ALTER TABLE "contracts" ADD COLUMN "guarantor_id" UUID;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_guarantor_id_fkey" FOREIGN KEY ("guarantor_id") REFERENCES "guarantors"("id") ON DELETE SET NULL;
CREATE INDEX "contracts_guarantor_id_idx" ON "contracts"("guarantor_id");
