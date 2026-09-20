-- CreateTable
CREATE TABLE "inventory_units" (
    "id" UUID NOT NULL,
    "market_id" UUID,
    "name" VARCHAR(50) NOT NULL,
    "symbol" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_units_market_id_idx" ON "inventory_units"("market_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_units_market_id_name_key" ON "inventory_units"("market_id", "name");

-- AddForeignKey
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: unit_id nullable first, filled by the backfill below, then locked to NOT NULL
ALTER TABLE "inventory_items" ADD COLUMN "unit_id" UUID;

-- Backfill: one InventoryUnit per distinct (market_id, unit) pair already in use, scoped to
-- that market (never global) so پیش‌فرض‌های سراسری دست‌نخورده می‌مانند و کاربر بعداً می‌تواند
-- این واحدهای موقتِ برگرفته از دادهٔ قدیمی را با واحدهای استاندارد جایگزین کند.
INSERT INTO "inventory_units" ("id", "market_id", "name", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), t.market_id, t.unit, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT market_id, unit FROM "inventory_items") t;

UPDATE "inventory_items" i
SET "unit_id" = u.id
FROM "inventory_units" u
WHERE u."market_id" = i."market_id" AND u."name" = i."unit";

-- AlterTable: every row now has a unit_id, so the column can be required and the old one dropped
ALTER TABLE "inventory_items" ALTER COLUMN "unit_id" SET NOT NULL;
ALTER TABLE "inventory_items" DROP COLUMN "unit";

-- CreateIndex
CREATE INDEX "inventory_items_unit_id_idx" ON "inventory_items"("unit_id");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "inventory_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
