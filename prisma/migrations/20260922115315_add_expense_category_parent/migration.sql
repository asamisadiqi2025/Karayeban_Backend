-- AlterTable
ALTER TABLE "ExpenseCategory" ADD COLUMN "parent_id" UUID;

-- CreateIndex
CREATE INDEX "ExpenseCategory_parent_id_idx" ON "ExpenseCategory"("parent_id");

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
