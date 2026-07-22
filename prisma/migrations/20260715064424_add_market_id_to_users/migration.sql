-- AlterTable
ALTER TABLE "users" ADD COLUMN     "marketId" UUID;

-- CreateIndex
CREATE INDEX "users_marketId_idx" ON "users"("marketId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE markets
ALTER COLUMN id
SET DEFAULT uuidv7();
