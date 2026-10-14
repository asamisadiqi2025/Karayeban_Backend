-- ShopType: narrow to exactly shop/unit/stall (table is empty, no data to migrate)
ALTER TABLE "shops" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "shops" ALTER COLUMN "type" TYPE TEXT USING ("type"::TEXT);
DROP TYPE "ShopType";
CREATE TYPE "ShopType" AS ENUM ('shop', 'unit', 'stall');
ALTER TABLE "shops" ALTER COLUMN "type" TYPE "ShopType" USING ("type"::"ShopType");
ALTER TABLE "shops" ALTER COLUMN "type" SET DEFAULT 'shop';

-- ShopStatus: add 'pending' between 'empty' and 'rented'
ALTER TABLE "shops" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "shops" ALTER COLUMN "status" TYPE TEXT USING ("status"::TEXT);
DROP TYPE "ShopStatus";
CREATE TYPE "ShopStatus" AS ENUM ('active', 'inactive', 'empty', 'pending', 'rented');
ALTER TABLE "shops" ALTER COLUMN "status" TYPE "ShopStatus" USING ("status"::"ShopStatus");
ALTER TABLE "shops" ALTER COLUMN "status" SET DEFAULT 'empty';
