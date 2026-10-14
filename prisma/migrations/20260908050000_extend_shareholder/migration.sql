ALTER TABLE "shareholders" ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now();

-- Same lesson as Guarantor/Tenant: a national ID number identifies exactly one real person.
ALTER TABLE "shareholders" ADD CONSTRAINT "shareholders_market_id_id_number_key" UNIQUE ("market_id", "id_number");
