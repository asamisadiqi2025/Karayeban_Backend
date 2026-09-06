import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { MeterStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class MeterQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(MeterStatus)
  status?: MeterStatus;

  @IsOptional()
  @IsUUID()
  shopId?: string;
}
