-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "currency_id" UUID,
ADD COLUMN     "notes" TEXT;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
