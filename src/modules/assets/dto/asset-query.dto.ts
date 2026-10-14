import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { AssetStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class AssetQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;

  // فیلتر بر اساس دسته‌بندی (مثلاً فقط «لوازم برق») — شناسهٔ دسته از GET /assets/categories.
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  currencyId?: string;
}
