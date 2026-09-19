import { IsEnum, IsOptional } from 'class-validator';
import { DebtStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class RentDebtQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(DebtStatus)
  status?: DebtStatus;
}
