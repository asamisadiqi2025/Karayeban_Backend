import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ElectricityBillStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ElectricityBillQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  shopId?: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsEnum(ElectricityBillStatus)
  status?: ElectricityBillStatus;
}
