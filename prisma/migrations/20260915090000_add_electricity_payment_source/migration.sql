-- AlterTable
ALTER TABLE "electricity_payments" ADD COLUMN     "is_opening_entry" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" "PaymentSourceType" NOT NULL DEFAULT 'BANK';
