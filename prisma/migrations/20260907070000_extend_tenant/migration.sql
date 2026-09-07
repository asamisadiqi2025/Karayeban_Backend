ALTER TABLE "tenants" ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now();

-- Same lesson as Guarantor: a national ID number identifies exactly one real person.
DROP INDEX "tenants_id_number_idx";
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_market_id_id_number_key" UNIQUE ("market_id", "id_number");
