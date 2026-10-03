import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateAssetCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  // فقط برای SUPER_ADMIN: ساخت دسته‌بندی زیر یک بازار مشخص. برای نقش‌های دیگر نادیده گرفته
  // می‌شود و بازار از روی کاربر جاری تعیین می‌گردد.
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
