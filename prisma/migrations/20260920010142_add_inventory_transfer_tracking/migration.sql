-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InventoryTransactionType" ADD VALUE 'TRANSFER_OUT';
ALTER TYPE "InventoryTransactionType" ADD VALUE 'TRANSFER_IN';

-- AlterTable
ALTER TABLE "inventory_transactions" ADD COLUMN     "transfer_group_id" UUID;

-- CreateIndex
CREATE INDEX "inventory_transactions_transfer_group_id_idx" ON "inventory_transactions"("transfer_group_id");
