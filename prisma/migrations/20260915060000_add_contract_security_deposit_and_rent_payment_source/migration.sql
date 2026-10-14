-- CreateEnum
CREATE TYPE "PaymentSourceType" AS ENUM ('BANK', 'SECURITY_DEPOSIT');

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "security_deposit" DECIMAL(18,4) DEFAULT 0,
ADD COLUMN     "security_deposit_account_id" UUID,
ADD COLUMN     "security_deposit_remaining" DECIMAL(18,4) DEFAULT 0;

-- AlterTable
ALTER TABLE "rent_payments" ADD COLUMN     "is_opening_entry" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" "PaymentSourceType" NOT NULL DEFAULT 'BANK',
ALTER COLUMN "account_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_security_deposit_account_id_fkey" FOREIGN KEY ("security_deposit_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
