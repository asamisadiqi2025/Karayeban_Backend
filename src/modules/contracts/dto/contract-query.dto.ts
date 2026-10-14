import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ContractStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ContractQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  shopId?: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;
}
