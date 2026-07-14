/*
  Warnings:

  - You are about to drop the column `account_id` on the `account_transactions` table. All the data in the column will be lost.
  - You are about to drop the column `balance_after_transaction` on the `account_transactions` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `account_transactions` table. All the data in the column will be lost.
  - You are about to drop the column `created_by` on the `account_transactions` table. All the data in the column will be lost.
  - You are about to drop the column `reference_id` on the `account_transactions` table. All the data in the column will be lost.
  - You are about to drop the column `reference_type` on the `account_transactions` table. All the data in the column will be lost.
  - You are about to drop the column `transaction_date` on the `account_transactions` table. All the data in the column will be lost.
  - You are about to drop the column `investment_date` on the `additional_investments` table. All the data in the column will be lost.
  - You are about to drop the column `shareholder_id` on the `additional_investments` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `additional_investments` table. All the data in the column will be lost.
  - You are about to drop the column `action` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `device` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `ip_address` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `new_value` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `old_value` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `record_id` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `table_name` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `account_id` on the `cheques` table. All the data in the column will be lost.
  - You are about to drop the column `bank_name` on the `cheques` table. All the data in the column will be lost.
  - You are about to drop the column `bounce_reason` on the `cheques` table. All the data in the column will be lost.
  - You are about to drop the column `cheque_number` on the `cheques` table. All the data in the column will be lost.
  - You are about to drop the column `contract_id` on the `cheques` table. All the data in the column will be lost.
  - You are about to drop the column `due_date` on the `cheques` table. All the data in the column will be lost.
  - You are about to drop the column `image` on the `cheques` table. All the data in the column will be lost.
  - You are about to drop the column `issue_date` on the `cheques` table. All the data in the column will be lost.
  - You are about to drop the column `tenant_id` on the `cheques` table. All the data in the column will be lost.
  - The `status` column on the `cheques` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `contract_id` on the `contract_terms` table. All the data in the column will be lost.
  - You are about to drop the column `monthly_off_days` on the `contract_terms` table. All the data in the column will be lost.
  - You are about to drop the column `special_conditions` on the `contract_terms` table. All the data in the column will be lost.
  - You are about to drop the column `termination_conditions` on the `contract_terms` table. All the data in the column will be lost.
  - You are about to drop the column `working_hours` on the `contract_terms` table. All the data in the column will be lost.
  - You are about to drop the column `approved_by` on the `contracts` table. All the data in the column will be lost.
  - You are about to drop the column `contract_number` on the `contracts` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `contracts` table. All the data in the column will be lost.
  - You are about to drop the column `deposit_amount` on the `contracts` table. All the data in the column will be lost.
  - You are about to drop the column `end_date` on the `contracts` table. All the data in the column will be lost.
  - You are about to drop the column `monthly_rent` on the `contracts` table. All the data in the column will be lost.
  - You are about to drop the column `next_contract_date` on the `contracts` table. All the data in the column will be lost.
  - You are about to drop the column `previous_contract_id` on the `contracts` table. All the data in the column will be lost.
  - You are about to drop the column `renew_count` on the `contracts` table. All the data in the column will be lost.
  - You are about to drop the column `shop_id` on the `contracts` table. All the data in the column will be lost.
  - You are about to drop the column `signed_at` on the `contracts` table. All the data in the column will be lost.
  - You are about to drop the column `start_date` on the `contracts` table. All the data in the column will be lost.
  - You are about to drop the column `tenant_id` on the `contracts` table. All the data in the column will be lost.
  - You are about to drop the column `terminated_by` on the `contracts` table. All the data in the column will be lost.
  - You are about to drop the column `termination_reason` on the `contracts` table. All the data in the column will be lost.
  - The `status` column on the `contracts` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `file_path` on the `documents` table. All the data in the column will be lost.
  - You are about to drop the column `file_type` on the `documents` table. All the data in the column will be lost.
  - You are about to drop the column `reference_id` on the `documents` table. All the data in the column will be lost.
  - You are about to drop the column `reference_table` on the `documents` table. All the data in the column will be lost.
  - You are about to drop the column `uploaded_at` on the `documents` table. All the data in the column will be lost.
  - You are about to drop the column `uploaded_by` on the `documents` table. All the data in the column will be lost.
  - You are about to drop the column `full_name` on the `employees` table. All the data in the column will be lost.
  - You are about to drop the column `job_title` on the `employees` table. All the data in the column will be lost.
  - The `status` column on the `employees` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `approved_by` on the `exit_clearances` table. All the data in the column will be lost.
  - You are about to drop the column `bill_settlement_status` on the `exit_clearances` table. All the data in the column will be lost.
  - You are about to drop the column `contract_id` on the `exit_clearances` table. All the data in the column will be lost.
  - You are about to drop the column `damage_cost` on the `exit_clearances` table. All the data in the column will be lost.
  - You are about to drop the column `exit_date` on the `exit_clearances` table. All the data in the column will be lost.
  - You are about to drop the column `refund_amount` on the `exit_clearances` table. All the data in the column will be lost.
  - You are about to drop the column `remaining_amount` on the `exit_clearances` table. All the data in the column will be lost.
  - You are about to drop the column `shop_condition` on the `exit_clearances` table. All the data in the column will be lost.
  - You are about to drop the column `shop_id` on the `exit_clearances` table. All the data in the column will be lost.
  - You are about to drop the column `tenant_id` on the `exit_clearances` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `floors` table. All the data in the column will be lost.
  - You are about to drop the column `floor_position` on the `floors` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `floors` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `guarantors` table. All the data in the column will be lost.
  - You are about to drop the column `full_name` on the `guarantors` table. All the data in the column will be lost.
  - You are about to drop the column `guarantor_form` on the `guarantors` table. All the data in the column will be lost.
  - You are about to drop the column `tazkira_copy` on the `guarantors` table. All the data in the column will be lost.
  - You are about to drop the column `tenant_id` on the `guarantors` table. All the data in the column will be lost.
  - You are about to drop the column `account_id` on the `market_expenses` table. All the data in the column will be lost.
  - You are about to drop the column `category_id` on the `market_expenses` table. All the data in the column will be lost.
  - You are about to drop the column `created_by` on the `market_expenses` table. All the data in the column will be lost.
  - You are about to drop the column `employee_id` on the `market_expenses` table. All the data in the column will be lost.
  - You are about to drop the column `expense_date` on the `market_expenses` table. All the data in the column will be lost.
  - You are about to drop the column `account_id` on the `miscellaneous_income` table. All the data in the column will be lost.
  - You are about to drop the column `received_date` on the `miscellaneous_income` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `notifications` table. All the data in the column will be lost.
  - You are about to drop the column `created_by` on the `notifications` table. All the data in the column will be lost.
  - You are about to drop the column `is_read` on the `notifications` table. All the data in the column will be lost.
  - You are about to drop the column `read_at` on the `notifications` table. All the data in the column will be lost.
  - You are about to drop the column `reference_id` on the `notifications` table. All the data in the column will be lost.
  - You are about to drop the column `reference_type` on the `notifications` table. All the data in the column will be lost.
  - You are about to drop the column `resolved_at` on the `notifications` table. All the data in the column will be lost.
  - The `priority` column on the `notifications` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `end_date` on the `ownership_histories` table. All the data in the column will be lost.
  - You are about to drop the column `shareholder_id` on the `ownership_histories` table. All the data in the column will be lost.
  - You are about to drop the column `start_date` on the `ownership_histories` table. All the data in the column will be lost.
  - You are about to drop the column `account_id` on the `rent_payments` table. All the data in the column will be lost.
  - You are about to drop the column `amount` on the `rent_payments` table. All the data in the column will be lost.
  - You are about to drop the column `contract_id` on the `rent_payments` table. All the data in the column will be lost.
  - You are about to drop the column `late_fee` on the `rent_payments` table. All the data in the column will be lost.
  - You are about to drop the column `payment_date` on the `rent_payments` table. All the data in the column will be lost.
  - You are about to drop the column `payment_method` on the `rent_payments` table. All the data in the column will be lost.
  - You are about to drop the column `received_by` on the `rent_payments` table. All the data in the column will be lost.
  - You are about to drop the column `shop_id` on the `rent_payments` table. All the data in the column will be lost.
  - The `status` column on the `rent_payments` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `role_permissions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `permission_id` on the `role_permissions` table. All the data in the column will be lost.
  - You are about to drop the column `role_id` on the `role_permissions` table. All the data in the column will be lost.
  - You are about to drop the column `first_name` on the `shareholders` table. All the data in the column will be lost.
  - You are about to drop the column `last_name` on the `shareholders` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `shop_categories` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `shop_categories` table. All the data in the column will be lost.
  - You are about to drop the column `area_in_square_meters` on the `shops` table. All the data in the column will be lost.
  - You are about to drop the column `category_id` on the `shops` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `shops` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `shops` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `shops` table. All the data in the column will be lost.
  - You are about to drop the column `electricity_meter_number` on the `shops` table. All the data in the column will be lost.
  - You are about to drop the column `floor_id` on the `shops` table. All the data in the column will be lost.
  - You are about to drop the column `rent_amount` on the `shops` table. All the data in the column will be lost.
  - You are about to drop the column `shop_code` on the `shops` table. All the data in the column will be lost.
  - You are about to drop the column `shop_number` on the `shops` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `shops` table. All the data in the column will be lost.
  - You are about to drop the column `water_meter_number` on the `shops` table. All the data in the column will be lost.
  - The `status` column on the `shops` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `business_name` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `debt_status` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `emergency_phone` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `full_name` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `phone2` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `photo` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `tazkira_number` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `tenants` table. All the data in the column will be lost.
  - The `gender` column on the `tenants` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `tenants` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `user_roles` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `role_id` on the `user_roles` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `user_roles` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `password` on the `users` table. All the data in the column will be lost.
  - The `status` column on the `users` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `bill_month` on the `utility_bills` table. All the data in the column will be lost.
  - You are about to drop the column `bill_year` on the `utility_bills` table. All the data in the column will be lost.
  - You are about to drop the column `current_meter` on the `utility_bills` table. All the data in the column will be lost.
  - You are about to drop the column `due_date` on the `utility_bills` table. All the data in the column will be lost.
  - You are about to drop the column `previous_meter` on the `utility_bills` table. All the data in the column will be lost.
  - You are about to drop the column `service_type` on the `utility_bills` table. All the data in the column will be lost.
  - You are about to drop the column `shop_id` on the `utility_bills` table. All the data in the column will be lost.
  - The `status` column on the `utility_bills` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `account_id` on the `withdrawals` table. All the data in the column will be lost.
  - You are about to drop the column `shareholder_id` on the `withdrawals` table. All the data in the column will be lost.
  - You are about to drop the column `withdrawal_date` on the `withdrawals` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[sequenceNo]` on the table `account_transactions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[marketId,bankName,chequeNumber]` on the table `cheques` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[contractId]` on the table `exit_clearances` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[marketId,expenseNumber]` on the table `market_expenses` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[contractId,year,month]` on the table `rent_payments` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[roleId,permissionId]` on the table `role_permissions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,roleId]` on the table `user_roles` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[shopId,type,billYear,billMonth]` on the table `utility_bills` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `accountId` to the `account_transactions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `balanceAfterTransaction` to the `account_transactions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketId` to the `account_transactions` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `type` on the `account_transactions` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `marketId` to the `accounts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `accounts` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `type` on the `accounts` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `currency` on the `accounts` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `investmentDate` to the `additional_investments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `investmentType` to the `additional_investments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketId` to the `additional_investments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shareholderId` to the `additional_investments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `additional_investments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `operation` to the `audit_logs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tableName` to the `audit_logs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `bankName` to the `cheques` table without a default value. This is not possible if the table is not empty.
  - Added the required column `chequeNumber` to the `cheques` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dueDate` to the `cheques` table without a default value. This is not possible if the table is not empty.
  - Added the required column `issueDate` to the `cheques` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketId` to the `cheques` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `cheques` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `cheques` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contractId` to the `contract_terms` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketId` to the `contract_terms` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `contract_terms` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contractNumber` to the `contracts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `depositAmount` to the `contracts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketId` to the `contracts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `monthlyRent` to the `contracts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shopId` to the `contracts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startDate` to the `contracts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `contracts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `contracts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `entityId` to the `documents` table without a default value. This is not possible if the table is not empty.
  - Added the required column `entityType` to the `documents` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fileName` to the `documents` table without a default value. This is not possible if the table is not empty.
  - Added the required column `filePath` to the `documents` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fileType` to the `documents` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketId` to the `documents` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fullName` to the `employees` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketId` to the `employees` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `employees` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contractId` to the `exit_clearances` table without a default value. This is not possible if the table is not empty.
  - Added the required column `exitDate` to the `exit_clearances` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketId` to the `exit_clearances` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shopId` to the `exit_clearances` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `exit_clearances` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `exit_clearances` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketId` to the `expense_categories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `expense_categories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `displayOrder` to the `floors` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketId` to the `floors` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `floors` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fullName` to the `guarantors` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketId` to the `guarantors` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `guarantors` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `guarantors` table without a default value. This is not possible if the table is not empty.
  - Made the column `phone` on table `guarantors` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `categoryId` to the `market_expenses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `expenseDate` to the `market_expenses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `expenseNumber` to the `market_expenses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketId` to the `market_expenses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `market_expenses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountId` to the `miscellaneous_income` table without a default value. This is not possible if the table is not empty.
  - Added the required column `incomeDate` to the `miscellaneous_income` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketId` to the `miscellaneous_income` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `miscellaneous_income` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketId` to the `notifications` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `type` on the `notifications` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `marketId` to the `ownership_histories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shareholderId` to the `ownership_histories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startDate` to the `ownership_histories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `ownership_histories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `permissions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `amountDue` to the `rent_payments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contractId` to the `rent_payments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketId` to the `rent_payments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `month` to the `rent_payments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `remainingAmount` to the `rent_payments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shopId` to the `rent_payments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `rent_payments` table without a default value. This is not possible if the table is not empty.
  - Made the column `year` on table `rent_payments` required. This step will fail if there are existing NULL values in that column.
  - The required column `id` was added to the `role_permissions` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `permissionId` to the `role_permissions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `roleId` to the `role_permissions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `roles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `firstName` to the `shareholders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketId` to the `shareholders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `shareholders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketId` to the `shop_categories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `shop_categories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `areaInSquareMeters` to the `shops` table without a default value. This is not possible if the table is not empty.
  - Added the required column `floorId` to the `shops` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketId` to the `shops` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rentAmount` to the `shops` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shopCode` to the `shops` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shopNumber` to the `shops` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `shops` table without a default value. This is not possible if the table is not empty.
  - Added the required column `firstName` to the `tenants` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lastName` to the `tenants` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketId` to the `tenants` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `tenants` table without a default value. This is not possible if the table is not empty.
  - Made the column `phone` on table `tenants` required. This step will fail if there are existing NULL values in that column.
  - The required column `id` was added to the `user_roles` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `roleId` to the `user_roles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `user_roles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `passwordHash` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `billMonth` to the `utility_bills` table without a default value. This is not possible if the table is not empty.
  - Added the required column `billYear` to the `utility_bills` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketId` to the `utility_bills` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shopId` to the `utility_bills` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `utility_bills` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `utility_bills` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketId` to the `withdrawals` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shareholderId` to the `withdrawals` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `withdrawals` table without a default value. This is not possible if the table is not empty.
  - Added the required column `withdrawalDate` to the `withdrawals` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MarketStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "ShopStatus" AS ENUM ('EMPTY', 'OCCUPIED', 'RESERVED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MOVED_OUT', 'BLACKLISTED');

-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('PAID', 'DEBTOR');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'TERMINATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "UtilityType" AS ENUM ('ELECTRICITY', 'WATER', 'CLEANING', 'SECURITY', 'OTHER');

-- CreateEnum
CREATE TYPE "UtilityPaymentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CASH', 'BANK', 'MOBILE_MONEY', 'OTHER');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('AFN', 'USD', 'EUR', 'GBP', 'OTHER');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "TransactionReferenceType" AS ENUM ('RENT_PAYMENT', 'UTILITY_BILL', 'MARKET_EXPENSE', 'MISC_INCOME', 'WITHDRAWAL', 'ADDITIONAL_INVESTMENT', 'CHEQUE', 'OTHER');

-- CreateEnum
CREATE TYPE "ChequeStatus" AS ENUM ('PENDING', 'RECEIVED', 'RETURNED', 'CLEARED');

-- CreateEnum
CREATE TYPE "DocumentEntityType" AS ENUM ('TENANT', 'CONTRACT', 'SHOP', 'GUARANTOR', 'CHEQUE', 'MARKET');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('RENT_DUE', 'PAYMENT_RECEIVED', 'CONTRACT_EXPIRING', 'UTILITY_DUE', 'CHEQUE_DUE', 'SYSTEM', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "InvestmentType" AS ENUM ('CASH', 'EQUIPMENT', 'CONSTRUCTION', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditOperation" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationReferenceType" AS ENUM ('CONTRACT', 'RENT_PAYMENT', 'UTILITY_BILL', 'CHEQUE', 'TENANT', 'SHOP', 'OTHER');

-- DropForeignKey
ALTER TABLE "account_transactions" DROP CONSTRAINT "account_transactions_account_id_fkey";

-- DropForeignKey
ALTER TABLE "account_transactions" DROP CONSTRAINT "account_transactions_created_by_fkey";

-- DropForeignKey
ALTER TABLE "additional_investments" DROP CONSTRAINT "additional_investments_shareholder_id_fkey";

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_user_id_fkey";

-- DropForeignKey
ALTER TABLE "cheques" DROP CONSTRAINT "cheques_account_id_fkey";

-- DropForeignKey
ALTER TABLE "cheques" DROP CONSTRAINT "cheques_contract_id_fkey";

-- DropForeignKey
ALTER TABLE "cheques" DROP CONSTRAINT "cheques_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "contract_terms" DROP CONSTRAINT "contract_terms_contract_id_fkey";

-- DropForeignKey
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_previous_contract_id_fkey";

-- DropForeignKey
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_shop_id_fkey";

-- DropForeignKey
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "documents" DROP CONSTRAINT "documents_uploaded_by_fkey";

-- DropForeignKey
ALTER TABLE "exit_clearances" DROP CONSTRAINT "exit_clearances_contract_id_fkey";

-- DropForeignKey
ALTER TABLE "exit_clearances" DROP CONSTRAINT "exit_clearances_shop_id_fkey";

-- DropForeignKey
ALTER TABLE "exit_clearances" DROP CONSTRAINT "exit_clearances_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "guarantors" DROP CONSTRAINT "guarantors_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "market_expenses" DROP CONSTRAINT "market_expenses_account_id_fkey";

-- DropForeignKey
ALTER TABLE "market_expenses" DROP CONSTRAINT "market_expenses_category_id_fkey";

-- DropForeignKey
ALTER TABLE "market_expenses" DROP CONSTRAINT "market_expenses_created_by_fkey";

-- DropForeignKey
ALTER TABLE "market_expenses" DROP CONSTRAINT "market_expenses_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "miscellaneous_income" DROP CONSTRAINT "miscellaneous_income_account_id_fkey";

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_created_by_fkey";

-- DropForeignKey
ALTER TABLE "ownership_histories" DROP CONSTRAINT "ownership_histories_shareholder_id_fkey";

-- DropForeignKey
ALTER TABLE "rent_payments" DROP CONSTRAINT "rent_payments_account_id_fkey";

-- DropForeignKey
ALTER TABLE "rent_payments" DROP CONSTRAINT "rent_payments_contract_id_fkey";

-- DropForeignKey
ALTER TABLE "rent_payments" DROP CONSTRAINT "rent_payments_received_by_fkey";

-- DropForeignKey
ALTER TABLE "rent_payments" DROP CONSTRAINT "rent_payments_shop_id_fkey";

-- DropForeignKey
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_permission_id_fkey";

-- DropForeignKey
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_role_id_fkey";

-- DropForeignKey
ALTER TABLE "shops" DROP CONSTRAINT "shops_category_id_fkey";

-- DropForeignKey
ALTER TABLE "shops" DROP CONSTRAINT "shops_floor_id_fkey";

-- DropForeignKey
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_role_id_fkey";

-- DropForeignKey
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_user_id_fkey";

-- DropForeignKey
ALTER TABLE "utility_bills" DROP CONSTRAINT "utility_bills_shop_id_fkey";

-- DropForeignKey
ALTER TABLE "withdrawals" DROP CONSTRAINT "withdrawals_account_id_fkey";

-- DropForeignKey
ALTER TABLE "withdrawals" DROP CONSTRAINT "withdrawals_shareholder_id_fkey";

-- DropIndex
DROP INDEX "idx_transaction_account";

-- DropIndex
DROP INDEX "idx_transaction_date";

-- DropIndex
DROP INDEX "idx_transaction_reference";

-- DropIndex
DROP INDEX "idx_audit_user";

-- DropIndex
DROP INDEX "contracts_contract_number_key";

-- DropIndex
DROP INDEX "idx_contract_number";

-- DropIndex
DROP INDEX "idx_contract_shop";

-- DropIndex
DROP INDEX "idx_contract_status";

-- DropIndex
DROP INDEX "idx_contract_tenant";

-- DropIndex
DROP INDEX "idx_document_reference";

-- DropIndex
DROP INDEX "idx_expense_date";

-- DropIndex
DROP INDEX "idx_notification_status";

-- DropIndex
DROP INDEX "idx_payment_contract";

-- DropIndex
DROP INDEX "idx_payment_date";

-- DropIndex
DROP INDEX "idx_payment_status";

-- DropIndex
DROP INDEX "idx_shop_category";

-- DropIndex
DROP INDEX "idx_shop_floor";

-- DropIndex
DROP INDEX "idx_shop_status";

-- DropIndex
DROP INDEX "shops_shop_code_key";

-- DropIndex
DROP INDEX "idx_tenant_phone";

-- DropIndex
DROP INDEX "idx_tenant_tazkira";

-- DropIndex
DROP INDEX "tenants_tazkira_number_key";

-- DropIndex
DROP INDEX "idx_bill_shop";

-- AlterTable
ALTER TABLE "account_transactions" DROP COLUMN "account_id",
DROP COLUMN "balance_after_transaction",
DROP COLUMN "created_at",
DROP COLUMN "created_by",
DROP COLUMN "reference_id",
DROP COLUMN "reference_type",
DROP COLUMN "transaction_date",
ADD COLUMN     "accountId" UUID NOT NULL,
ADD COLUMN     "balanceAfterTransaction" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "marketId" UUID NOT NULL,
ADD COLUMN     "referenceId" UUID,
ADD COLUMN     "referenceType" "TransactionReferenceType",
ADD COLUMN     "sequenceNo" BIGSERIAL NOT NULL,
ADD COLUMN     "transactionDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
DROP COLUMN "type",
ADD COLUMN     "type" "TransactionType" NOT NULL,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "currentBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "deletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "marketId" UUID NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "updatedById" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "name" SET DATA TYPE TEXT,
DROP COLUMN "type",
ADD COLUMN     "type" "AccountType" NOT NULL,
DROP COLUMN "currency",
ADD COLUMN     "currency" "Currency" NOT NULL;

-- AlterTable
ALTER TABLE "additional_investments" DROP COLUMN "investment_date",
DROP COLUMN "shareholder_id",
DROP COLUMN "type",
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "investmentDate" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "investmentType" "InvestmentType" NOT NULL,
ADD COLUMN     "marketId" UUID NOT NULL,
ADD COLUMN     "shareholderId" UUID NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "updatedById" UUID,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "audit_logs" DROP COLUMN "action",
DROP COLUMN "created_at",
DROP COLUMN "device",
DROP COLUMN "ip_address",
DROP COLUMN "new_value",
DROP COLUMN "old_value",
DROP COLUMN "record_id",
DROP COLUMN "table_name",
DROP COLUMN "user_id",
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deviceInfo" TEXT,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "marketId" UUID,
ADD COLUMN     "newValue" JSONB,
ADD COLUMN     "oldValue" JSONB,
ADD COLUMN     "operation" "AuditOperation" NOT NULL,
ADD COLUMN     "recordId" TEXT,
ADD COLUMN     "tableName" TEXT NOT NULL,
ADD COLUMN     "userId" UUID;

-- AlterTable
ALTER TABLE "cheques" DROP COLUMN "account_id",
DROP COLUMN "bank_name",
DROP COLUMN "bounce_reason",
DROP COLUMN "cheque_number",
DROP COLUMN "contract_id",
DROP COLUMN "due_date",
DROP COLUMN "image",
DROP COLUMN "issue_date",
DROP COLUMN "tenant_id",
ADD COLUMN     "accountId" UUID,
ADD COLUMN     "bankName" TEXT NOT NULL,
ADD COLUMN     "chequeNumber" TEXT NOT NULL,
ADD COLUMN     "clearedDate" TIMESTAMPTZ(3),
ADD COLUMN     "contractId" UUID,
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "dueDate" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "issueDate" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "marketId" UUID NOT NULL,
ADD COLUMN     "receivedDate" TIMESTAMPTZ(3),
ADD COLUMN     "returnReason" TEXT,
ADD COLUMN     "returnedDate" TIMESTAMPTZ(3),
ADD COLUMN     "tenantId" UUID NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "updatedById" UUID,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2),
DROP COLUMN "status",
ADD COLUMN     "status" "ChequeStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "contract_terms" DROP COLUMN "contract_id",
DROP COLUMN "monthly_off_days",
DROP COLUMN "special_conditions",
DROP COLUMN "termination_conditions",
DROP COLUMN "working_hours",
ADD COLUMN     "contractId" UUID NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "marketId" UUID NOT NULL,
ADD COLUMN     "monthlyHoliday" INTEGER,
ADD COLUMN     "specialConditions" TEXT,
ADD COLUMN     "terminationCondition" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "workingHours" TEXT;

-- AlterTable
ALTER TABLE "contracts" DROP COLUMN "approved_by",
DROP COLUMN "contract_number",
DROP COLUMN "created_at",
DROP COLUMN "deposit_amount",
DROP COLUMN "end_date",
DROP COLUMN "monthly_rent",
DROP COLUMN "next_contract_date",
DROP COLUMN "previous_contract_id",
DROP COLUMN "renew_count",
DROP COLUMN "shop_id",
DROP COLUMN "signed_at",
DROP COLUMN "start_date",
DROP COLUMN "tenant_id",
DROP COLUMN "terminated_by",
DROP COLUMN "termination_reason",
ADD COLUMN     "approvedById" UUID,
ADD COLUMN     "contractNumber" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "deletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "depositAmount" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "endDate" TIMESTAMPTZ(3),
ADD COLUMN     "marketId" UUID NOT NULL,
ADD COLUMN     "monthlyRent" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "previousContractId" UUID,
ADD COLUMN     "renewalCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shopId" UUID NOT NULL,
ADD COLUMN     "signedDate" TIMESTAMPTZ(3),
ADD COLUMN     "startDate" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "tenantId" UUID NOT NULL,
ADD COLUMN     "terminatedById" UUID,
ADD COLUMN     "terminationReason" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "updatedById" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
DROP COLUMN "status",
ADD COLUMN     "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "documents" DROP COLUMN "file_path",
DROP COLUMN "file_type",
DROP COLUMN "reference_id",
DROP COLUMN "reference_table",
DROP COLUMN "uploaded_at",
DROP COLUMN "uploaded_by",
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "entityId" UUID NOT NULL,
ADD COLUMN     "entityType" "DocumentEntityType" NOT NULL,
ADD COLUMN     "extension" TEXT,
ADD COLUMN     "fileName" TEXT NOT NULL,
ADD COLUMN     "filePath" TEXT NOT NULL,
ADD COLUMN     "fileSize" BIGINT,
ADD COLUMN     "fileType" TEXT NOT NULL,
ADD COLUMN     "marketId" UUID NOT NULL,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "uploadedById" UUID;

-- AlterTable
ALTER TABLE "employees" DROP COLUMN "full_name",
DROP COLUMN "job_title",
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "deletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "fullName" TEXT NOT NULL,
ADD COLUMN     "marketId" UUID NOT NULL,
ADD COLUMN     "position" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "updatedById" UUID,
ALTER COLUMN "phone" SET DATA TYPE TEXT,
ALTER COLUMN "salary" DROP NOT NULL,
ALTER COLUMN "salary" DROP DEFAULT,
ALTER COLUMN "salary" SET DATA TYPE DECIMAL(14,2),
DROP COLUMN "status",
ADD COLUMN     "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "exit_clearances" DROP COLUMN "approved_by",
DROP COLUMN "bill_settlement_status",
DROP COLUMN "contract_id",
DROP COLUMN "damage_cost",
DROP COLUMN "exit_date",
DROP COLUMN "refund_amount",
DROP COLUMN "remaining_amount",
DROP COLUMN "shop_condition",
DROP COLUMN "shop_id",
DROP COLUMN "tenant_id",
ADD COLUMN     "approvedById" UUID,
ADD COLUMN     "billsCleared" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "contractId" UUID NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "damageCost" DECIMAL(14,2),
ADD COLUMN     "exitDate" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "marketId" UUID NOT NULL,
ADD COLUMN     "refundedAmount" DECIMAL(14,2),
ADD COLUMN     "remainingAmount" DECIMAL(14,2),
ADD COLUMN     "shopCondition" TEXT,
ADD COLUMN     "shopId" UUID NOT NULL,
ADD COLUMN     "tenantId" UUID NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "updatedById" UUID;

-- AlterTable
ALTER TABLE "expense_categories" ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "deletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "marketId" UUID NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "updatedById" UUID,
ALTER COLUMN "name" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "floors" DROP COLUMN "created_at",
DROP COLUMN "floor_position",
DROP COLUMN "updated_at",
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "deletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "displayOrder" INTEGER NOT NULL,
ADD COLUMN     "marketId" UUID NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "updatedById" UUID,
ALTER COLUMN "name" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "guarantors" DROP COLUMN "created_at",
DROP COLUMN "full_name",
DROP COLUMN "guarantor_form",
DROP COLUMN "tazkira_copy",
DROP COLUMN "tenant_id",
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "fullName" TEXT NOT NULL,
ADD COLUMN     "marketId" UUID NOT NULL,
ADD COLUMN     "tenantId" UUID NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "updatedById" UUID,
ALTER COLUMN "phone" SET NOT NULL,
ALTER COLUMN "phone" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "market_expenses" DROP COLUMN "account_id",
DROP COLUMN "category_id",
DROP COLUMN "created_by",
DROP COLUMN "employee_id",
DROP COLUMN "expense_date",
ADD COLUMN     "accountId" UUID,
ADD COLUMN     "categoryId" UUID NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "employeeId" UUID,
ADD COLUMN     "expenseDate" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "expenseNumber" TEXT NOT NULL,
ADD COLUMN     "marketId" UUID NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "updatedById" UUID,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "miscellaneous_income" DROP COLUMN "account_id",
DROP COLUMN "received_date",
ADD COLUMN     "accountId" UUID NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "incomeDate" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "marketId" UUID NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "updatedById" UUID,
ALTER COLUMN "source" SET DATA TYPE TEXT,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "notifications" DROP COLUMN "created_at",
DROP COLUMN "created_by",
DROP COLUMN "is_read",
DROP COLUMN "read_at",
DROP COLUMN "reference_id",
DROP COLUMN "reference_type",
DROP COLUMN "resolved_at",
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "isRead" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketId" UUID NOT NULL,
ADD COLUMN     "readAt" TIMESTAMPTZ(3),
ADD COLUMN     "referenceId" UUID,
ADD COLUMN     "referenceType" "NotificationReferenceType",
ADD COLUMN     "resolvedAt" TIMESTAMPTZ(3),
ADD COLUMN     "userId" UUID,
DROP COLUMN "type",
ADD COLUMN     "type" "NotificationType" NOT NULL,
DROP COLUMN "priority",
ADD COLUMN     "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL';

-- AlterTable
ALTER TABLE "ownership_histories" DROP COLUMN "end_date",
DROP COLUMN "shareholder_id",
DROP COLUMN "start_date",
ADD COLUMN     "approvedById" UUID,
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "endDate" TIMESTAMPTZ(3),
ADD COLUMN     "marketId" UUID NOT NULL,
ADD COLUMN     "shareholderId" UUID NOT NULL,
ADD COLUMN     "startDate" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL;

-- AlterTable
ALTER TABLE "permissions" ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ALTER COLUMN "name" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "rent_payments" DROP COLUMN "account_id",
DROP COLUMN "amount",
DROP COLUMN "contract_id",
DROP COLUMN "late_fee",
DROP COLUMN "payment_date",
DROP COLUMN "payment_method",
DROP COLUMN "received_by",
DROP COLUMN "shop_id",
ADD COLUMN     "accountId" UUID,
ADD COLUMN     "amountDue" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "amountPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "contractId" UUID NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "lateFee" DECIMAL(14,2),
ADD COLUMN     "marketId" UUID NOT NULL,
ADD COLUMN     "month" INTEGER NOT NULL,
ADD COLUMN     "paymentDate" TIMESTAMPTZ(3),
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "receivedById" UUID,
ADD COLUMN     "remainingAmount" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "shopId" UUID NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "updatedById" UUID,
DROP COLUMN "status",
ADD COLUMN     "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "year" SET NOT NULL,
ALTER COLUMN "discount" DROP NOT NULL,
ALTER COLUMN "discount" DROP DEFAULT,
ALTER COLUMN "discount" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_pkey",
DROP COLUMN "permission_id",
DROP COLUMN "role_id",
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "id" UUID NOT NULL,
ADD COLUMN     "permissionId" UUID NOT NULL,
ADD COLUMN     "roleId" UUID NOT NULL,
ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ALTER COLUMN "name" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "shareholders" DROP COLUMN "first_name",
DROP COLUMN "last_name",
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "deletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "firstName" TEXT NOT NULL,
ADD COLUMN     "initialInvestment" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "marketId" UUID NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "updatedById" UUID,
ALTER COLUMN "phone" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "shop_categories" DROP COLUMN "created_at",
DROP COLUMN "updated_at",
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "deletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "marketId" UUID NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "updatedById" UUID,
ALTER COLUMN "name" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "shops" DROP COLUMN "area_in_square_meters",
DROP COLUMN "category_id",
DROP COLUMN "created_at",
DROP COLUMN "deleted_at",
DROP COLUMN "description",
DROP COLUMN "electricity_meter_number",
DROP COLUMN "floor_id",
DROP COLUMN "rent_amount",
DROP COLUMN "shop_code",
DROP COLUMN "shop_number",
DROP COLUMN "updated_at",
DROP COLUMN "water_meter_number",
ADD COLUMN     "areaInSquareMeters" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "categoryId" UUID,
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "deletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "electricityMeterNumber" TEXT,
ADD COLUMN     "floorId" UUID NOT NULL,
ADD COLUMN     "marketId" UUID NOT NULL,
ADD COLUMN     "rentAmount" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "shopCode" TEXT NOT NULL,
ADD COLUMN     "shopNumber" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "updatedById" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "waterMeterNumber" TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "ShopStatus" NOT NULL DEFAULT 'EMPTY';

-- AlterTable
ALTER TABLE "tenants" DROP COLUMN "business_name",
DROP COLUMN "created_at",
DROP COLUMN "debt_status",
DROP COLUMN "deleted_at",
DROP COLUMN "description",
DROP COLUMN "emergency_phone",
DROP COLUMN "full_name",
DROP COLUMN "phone2",
DROP COLUMN "photo",
DROP COLUMN "tazkira_number",
DROP COLUMN "updated_at",
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "debtStatus" "DebtStatus" NOT NULL DEFAULT 'PAID',
ADD COLUMN     "deletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "firstName" TEXT NOT NULL,
ADD COLUMN     "lastName" TEXT NOT NULL,
ADD COLUMN     "marketId" UUID NOT NULL,
ADD COLUMN     "nationalId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "updatedById" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "phone" SET NOT NULL,
ALTER COLUMN "phone" SET DATA TYPE TEXT,
DROP COLUMN "gender",
ADD COLUMN     "gender" "Gender",
DROP COLUMN "status",
ADD COLUMN     "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_pkey",
DROP COLUMN "role_id",
DROP COLUMN "user_id",
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "id" UUID NOT NULL,
ADD COLUMN     "roleId" UUID NOT NULL,
ADD COLUMN     "userId" UUID NOT NULL,
ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "users" DROP COLUMN "created_at",
DROP COLUMN "password",
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "passwordHash" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ALTER COLUMN "name" SET DATA TYPE TEXT,
ALTER COLUMN "username" SET DATA TYPE TEXT,
ALTER COLUMN "email" SET DATA TYPE TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "utility_bills" DROP COLUMN "bill_month",
DROP COLUMN "bill_year",
DROP COLUMN "current_meter",
DROP COLUMN "due_date",
DROP COLUMN "previous_meter",
DROP COLUMN "service_type",
DROP COLUMN "shop_id",
ADD COLUMN     "billMonth" INTEGER NOT NULL,
ADD COLUMN     "billYear" INTEGER NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "currentMeter" DECIMAL(12,3),
ADD COLUMN     "dueDate" TIMESTAMPTZ(3),
ADD COLUMN     "marketId" UUID NOT NULL,
ADD COLUMN     "previousMeter" DECIMAL(12,3),
ADD COLUMN     "shopId" UUID NOT NULL,
ADD COLUMN     "type" "UtilityType" NOT NULL,
ADD COLUMN     "unitsConsumed" DECIMAL(12,3),
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "updatedById" UUID,
ALTER COLUMN "rate" DROP NOT NULL,
ALTER COLUMN "rate" DROP DEFAULT,
ALTER COLUMN "rate" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "amount" DROP DEFAULT,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2),
DROP COLUMN "status",
ADD COLUMN     "status" "UtilityPaymentStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "withdrawals" DROP COLUMN "account_id",
DROP COLUMN "shareholder_id",
DROP COLUMN "withdrawal_date",
ADD COLUMN     "accountId" UUID,
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "marketId" UUID NOT NULL,
ADD COLUMN     "shareholderId" UUID NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "updatedById" UUID,
ADD COLUMN     "withdrawalDate" TIMESTAMPTZ(3) NOT NULL,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2);

-- CreateTable
CREATE TABLE "markets" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "status" "MarketStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_markets" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "marketId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lastUsedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "markets_status_idx" ON "markets"("status");

-- CreateIndex
CREATE INDEX "markets_deletedAt_idx" ON "markets"("deletedAt");

-- CreateIndex
CREATE INDEX "user_markets_userId_idx" ON "user_markets"("userId");

-- CreateIndex
CREATE INDEX "user_markets_marketId_idx" ON "user_markets"("marketId");

-- CreateIndex
CREATE UNIQUE INDEX "user_markets_userId_marketId_key" ON "user_markets"("userId", "marketId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshTokenHash_key" ON "sessions"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_tokenHash_key" ON "password_resets"("tokenHash");

-- CreateIndex
CREATE INDEX "password_resets_userId_idx" ON "password_resets"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_transactions_sequenceNo_key" ON "account_transactions"("sequenceNo");

-- CreateIndex
CREATE INDEX "account_transactions_marketId_idx" ON "account_transactions"("marketId");

-- CreateIndex
CREATE INDEX "account_transactions_accountId_idx" ON "account_transactions"("accountId");

-- CreateIndex
CREATE INDEX "account_transactions_referenceType_referenceId_idx" ON "account_transactions"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "accounts_marketId_idx" ON "accounts"("marketId");

-- CreateIndex
CREATE INDEX "accounts_deletedAt_idx" ON "accounts"("deletedAt");

-- CreateIndex
CREATE INDEX "additional_investments_marketId_idx" ON "additional_investments"("marketId");

-- CreateIndex
CREATE INDEX "additional_investments_shareholderId_idx" ON "additional_investments"("shareholderId");

-- CreateIndex
CREATE INDEX "audit_logs_marketId_idx" ON "audit_logs"("marketId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_tableName_recordId_idx" ON "audit_logs"("tableName", "recordId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "cheques_marketId_status_idx" ON "cheques"("marketId", "status");

-- CreateIndex
CREATE INDEX "cheques_tenantId_idx" ON "cheques"("tenantId");

-- CreateIndex
CREATE INDEX "cheques_contractId_idx" ON "cheques"("contractId");

-- CreateIndex
CREATE INDEX "cheques_accountId_idx" ON "cheques"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "cheques_marketId_bankName_chequeNumber_key" ON "cheques"("marketId", "bankName", "chequeNumber");

-- CreateIndex
CREATE INDEX "contract_terms_marketId_idx" ON "contract_terms"("marketId");

-- CreateIndex
CREATE INDEX "contract_terms_contractId_idx" ON "contract_terms"("contractId");

-- CreateIndex
CREATE INDEX "contracts_marketId_status_idx" ON "contracts"("marketId", "status");

-- CreateIndex
CREATE INDEX "contracts_shopId_idx" ON "contracts"("shopId");

-- CreateIndex
CREATE INDEX "contracts_tenantId_idx" ON "contracts"("tenantId");

-- CreateIndex
CREATE INDEX "contracts_previousContractId_idx" ON "contracts"("previousContractId");

-- CreateIndex
CREATE INDEX "contracts_deletedAt_idx" ON "contracts"("deletedAt");

-- CreateIndex
CREATE INDEX "documents_marketId_idx" ON "documents"("marketId");

-- CreateIndex
CREATE INDEX "documents_entityType_entityId_idx" ON "documents"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "employees_marketId_status_idx" ON "employees"("marketId", "status");

-- CreateIndex
CREATE INDEX "employees_deletedAt_idx" ON "employees"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "exit_clearances_contractId_key" ON "exit_clearances"("contractId");

-- CreateIndex
CREATE INDEX "exit_clearances_marketId_idx" ON "exit_clearances"("marketId");

-- CreateIndex
CREATE INDEX "exit_clearances_tenantId_idx" ON "exit_clearances"("tenantId");

-- CreateIndex
CREATE INDEX "exit_clearances_shopId_idx" ON "exit_clearances"("shopId");

-- CreateIndex
CREATE INDEX "expense_categories_marketId_idx" ON "expense_categories"("marketId");

-- CreateIndex
CREATE INDEX "expense_categories_deletedAt_idx" ON "expense_categories"("deletedAt");

-- CreateIndex
CREATE INDEX "floors_marketId_idx" ON "floors"("marketId");

-- CreateIndex
CREATE INDEX "floors_deletedAt_idx" ON "floors"("deletedAt");

-- CreateIndex
CREATE INDEX "guarantors_marketId_idx" ON "guarantors"("marketId");

-- CreateIndex
CREATE INDEX "guarantors_tenantId_idx" ON "guarantors"("tenantId");

-- CreateIndex
CREATE INDEX "market_expenses_marketId_idx" ON "market_expenses"("marketId");

-- CreateIndex
CREATE INDEX "market_expenses_categoryId_idx" ON "market_expenses"("categoryId");

-- CreateIndex
CREATE INDEX "market_expenses_employeeId_idx" ON "market_expenses"("employeeId");

-- CreateIndex
CREATE INDEX "market_expenses_accountId_idx" ON "market_expenses"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "market_expenses_marketId_expenseNumber_key" ON "market_expenses"("marketId", "expenseNumber");

-- CreateIndex
CREATE INDEX "miscellaneous_income_marketId_idx" ON "miscellaneous_income"("marketId");

-- CreateIndex
CREATE INDEX "miscellaneous_income_accountId_idx" ON "miscellaneous_income"("accountId");

-- CreateIndex
CREATE INDEX "notifications_marketId_isRead_idx" ON "notifications"("marketId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_referenceType_referenceId_idx" ON "notifications"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "ownership_histories_marketId_idx" ON "ownership_histories"("marketId");

-- CreateIndex
CREATE INDEX "ownership_histories_shareholderId_idx" ON "ownership_histories"("shareholderId");

-- CreateIndex
CREATE INDEX "ownership_histories_shareholderId_startDate_endDate_idx" ON "ownership_histories"("shareholderId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "rent_payments_marketId_year_idx" ON "rent_payments"("marketId", "year");

-- CreateIndex
CREATE INDEX "rent_payments_marketId_status_idx" ON "rent_payments"("marketId", "status");

-- CreateIndex
CREATE INDEX "rent_payments_contractId_idx" ON "rent_payments"("contractId");

-- CreateIndex
CREATE INDEX "rent_payments_shopId_idx" ON "rent_payments"("shopId");

-- CreateIndex
CREATE INDEX "rent_payments_accountId_idx" ON "rent_payments"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "rent_payments_contractId_year_month_key" ON "rent_payments"("contractId", "year", "month");

-- CreateIndex
CREATE INDEX "role_permissions_roleId_idx" ON "role_permissions"("roleId");

-- CreateIndex
CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "role_permissions"("roleId", "permissionId");

-- CreateIndex
CREATE INDEX "shareholders_marketId_idx" ON "shareholders"("marketId");

-- CreateIndex
CREATE INDEX "shareholders_deletedAt_idx" ON "shareholders"("deletedAt");

-- CreateIndex
CREATE INDEX "shop_categories_marketId_idx" ON "shop_categories"("marketId");

-- CreateIndex
CREATE INDEX "shop_categories_deletedAt_idx" ON "shop_categories"("deletedAt");

-- CreateIndex
CREATE INDEX "shops_marketId_status_idx" ON "shops"("marketId", "status");

-- CreateIndex
CREATE INDEX "shops_floorId_idx" ON "shops"("floorId");

-- CreateIndex
CREATE INDEX "shops_categoryId_idx" ON "shops"("categoryId");

-- CreateIndex
CREATE INDEX "shops_deletedAt_idx" ON "shops"("deletedAt");

-- CreateIndex
CREATE INDEX "tenants_marketId_status_idx" ON "tenants"("marketId", "status");

-- CreateIndex
CREATE INDEX "tenants_deletedAt_idx" ON "tenants"("deletedAt");

-- CreateIndex
CREATE INDEX "user_roles_userId_idx" ON "user_roles"("userId");

-- CreateIndex
CREATE INDEX "user_roles_roleId_idx" ON "user_roles"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_key" ON "user_roles"("userId", "roleId");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE INDEX "utility_bills_marketId_billYear_billMonth_idx" ON "utility_bills"("marketId", "billYear", "billMonth");

-- CreateIndex
CREATE INDEX "utility_bills_marketId_status_idx" ON "utility_bills"("marketId", "status");

-- CreateIndex
CREATE INDEX "utility_bills_shopId_idx" ON "utility_bills"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "utility_bills_shopId_type_billYear_billMonth_key" ON "utility_bills"("shopId", "type", "billYear", "billMonth");

-- CreateIndex
CREATE INDEX "withdrawals_marketId_idx" ON "withdrawals"("marketId");

-- CreateIndex
CREATE INDEX "withdrawals_shareholderId_idx" ON "withdrawals"("shareholderId");

-- CreateIndex
CREATE INDEX "withdrawals_accountId_idx" ON "withdrawals"("accountId");

-- AddForeignKey
ALTER TABLE "floors" ADD CONSTRAINT "floors_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "shop_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_categories" ADD CONSTRAINT "shop_categories_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guarantors" ADD CONSTRAINT "guarantors_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guarantors" ADD CONSTRAINT "guarantors_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_previousContractId_fkey" FOREIGN KEY ("previousContractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_terms" ADD CONSTRAINT "contract_terms_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_terms" ADD CONSTRAINT "contract_terms_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_bills" ADD CONSTRAINT "utility_bills_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_bills" ADD CONSTRAINT "utility_bills_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_expenses" ADD CONSTRAINT "market_expenses_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_expenses" ADD CONSTRAINT "market_expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_expenses" ADD CONSTRAINT "market_expenses_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_expenses" ADD CONSTRAINT "market_expenses_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miscellaneous_income" ADD CONSTRAINT "miscellaneous_income_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miscellaneous_income" ADD CONSTRAINT "miscellaneous_income_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_clearances" ADD CONSTRAINT "exit_clearances_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_clearances" ADD CONSTRAINT "exit_clearances_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_clearances" ADD CONSTRAINT "exit_clearances_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_clearances" ADD CONSTRAINT "exit_clearances_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_markets" ADD CONSTRAINT "user_markets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_markets" ADD CONSTRAINT "user_markets_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shareholders" ADD CONSTRAINT "shareholders_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_histories" ADD CONSTRAINT "ownership_histories_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_histories" ADD CONSTRAINT "ownership_histories_shareholderId_fkey" FOREIGN KEY ("shareholderId") REFERENCES "shareholders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_investments" ADD CONSTRAINT "additional_investments_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_investments" ADD CONSTRAINT "additional_investments_shareholderId_fkey" FOREIGN KEY ("shareholderId") REFERENCES "shareholders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_shareholderId_fkey" FOREIGN KEY ("shareholderId") REFERENCES "shareholders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
