import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { RentChargeStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class RentChargeQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  contractId?: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsUUID()
  shopId?: string;

  @IsOptional()
  @IsEnum(RentChargeStatus)
  status?: RentChargeStatus;

  // برای گزارش «نزدیک به ختم دوره» یا «فاکتورهای یک بازهٔ تاریخی مشخص» — مثلاً
  // periodEndFrom=امروز&periodEndTo=۷روز دیگر برای دوکان‌هایی که این هفته سررسید دارند.
  @IsOptional()
  @IsDateString()
  periodEndFrom?: string;

  @IsOptional()
  @IsDateString()
  periodEndTo?: string;
}
