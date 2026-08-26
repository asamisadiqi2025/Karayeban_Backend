/*
  Warnings:

  - Added the required column `received_amount` to the `account_transfers` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "account_transfers" ADD COLUMN     "exchange_rate" DECIMAL(18,6),
ADD COLUMN     "received_amount" DECIMAL(18,4) NOT NULL;
