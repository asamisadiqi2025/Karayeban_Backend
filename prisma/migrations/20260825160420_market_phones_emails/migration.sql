-- AlterTable
ALTER TABLE "markets" DROP COLUMN "contacts",
ADD COLUMN     "emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "phones" TEXT[] DEFAULT ARRAY[]::TEXT[];

