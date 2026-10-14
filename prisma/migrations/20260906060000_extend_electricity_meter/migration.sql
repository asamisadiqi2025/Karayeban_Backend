-- Table is empty; safe to rename for naming consistency with the rest of the schema.
ALTER TABLE "ElectricityMeter" RENAME TO "electricity_meters";
ALTER TABLE "electricity_meters" RENAME COLUMN "serialNumber" TO "serial_number";

-- New fields
ALTER TABLE "electricity_meters" ADD COLUMN "location" VARCHAR(255);
ALTER TABLE "electricity_meters" ADD COLUMN "last_reading" DECIMAL(12,2);
ALTER TABLE "electricity_meters" ADD COLUMN "last_reading_date" TIMESTAMPTZ(6);

-- One meter per shop; one serial number per market (nulls don't conflict with each other)
ALTER TABLE "electricity_meters" ADD CONSTRAINT "electricity_meters_market_id_serial_number_key" UNIQUE ("market_id", "serial_number");
ALTER TABLE "electricity_meters" ADD CONSTRAINT "electricity_meters_shop_id_key" UNIQUE ("shop_id");
