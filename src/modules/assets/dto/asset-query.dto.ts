import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AssetStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class AssetQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsUUID()
  currencyId?: string;
}
