-- A national ID number identifies exactly one real person; two Guarantor rows in the
-- same market with the same idNumber means the same person was registered twice.
-- (3 pre-existing duplicate test rows were cleaned up before applying this migration.)
ALTER TABLE "guarantors" ADD CONSTRAINT "guarantors_market_id_id_number_key" UNIQUE ("market_id", "id_number");
