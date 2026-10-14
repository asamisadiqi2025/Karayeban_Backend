import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAssetCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  // دسته‌بندیِ غیرفعال دیگر به دارایی‌های تازه (یا دارایی‌ای که دسته‌اش را عوض می‌کنیم) داده
  // نمی‌شود؛ دارایی‌هایی که از قبل در آن‌اند دست‌نخورده می‌مانند.
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isActive?: boolean;
}
