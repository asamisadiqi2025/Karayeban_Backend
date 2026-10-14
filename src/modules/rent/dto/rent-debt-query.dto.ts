import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { DebtStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class RentDebtQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(DebtStatus)
  status?: DebtStatus;

  // فقط بدهی‌های یک ارز (هر ردیفِ فهرست = یک مستأجر در یک ارز).
  @IsOptional()
  @IsUUID()
  currencyId?: string;
}
