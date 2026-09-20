import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

// انتقال کالا بین گدام‌ها: گدام مبدا و مقصد صریحاً مشخص می‌شوند و کالا باید متعلق به
// گدام مبدا باشد تا انتقال با اطمینان و بدون ابهام انجام شود.
export class CreateInventoryTransferDto {
  @IsUUID()
  itemId: string;

  @IsUUID()
  fromWarehouseId: string;

  @IsUUID()
  toWarehouseId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsOptional()
  @IsDateString()
  transactionDate?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  notes?: string;
}
