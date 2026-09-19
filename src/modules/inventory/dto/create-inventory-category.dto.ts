import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateInventoryCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  // خالی = دسته‌بندی سراسری، برای همهٔ بازارها قابل‌استفاده. فقط SUPER_ADMIN می‌تواند
  // یکی صریح بفرستد؛ نقش‌های دیگر همیشه دسته‌بندیِ مخصوص بازار خودشان را می‌سازند.
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
