import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class AssetCategoryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isActive?: boolean;

  // فقط برای SUPER_ADMIN: دیدنِ دسته‌بندی‌های یک بازار مشخص (بقیهٔ نقش‌ها همیشه بازارِ خودشان).
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
