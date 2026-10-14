-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'LOGIN_FAILED';

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_market_id_fkey";

-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "market_id" DROP NOT NULL,
ALTER COLUMN "entity_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
