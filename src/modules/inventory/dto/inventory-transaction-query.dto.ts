import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { InventoryTransactionType } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class InventoryTransactionQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsEnum(InventoryTransactionType)
  type?: InventoryTransactionType;

  // برای گزارش «تراکنش‌های یک بازهٔ مشخص» — مثلاً transactionDateFrom=۱حمل&transactionDateTo=۳۰حمل.
  @IsOptional()
  @IsDateString()
  transactionDateFrom?: string;

  @IsOptional()
  @IsDateString()
  transactionDateTo?: string;
}
