import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateExpenseCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  // خالی = دسته‌بندی سراسری، برای همهٔ بازارها قابل‌استفاده (مثل InventoryCategory).
  // فقط SUPER_ADMIN می‌تواند یکی صریح بفرستد؛ نقش‌های دیگر همیشه دسته‌بندیِ مخصوص
  // بازار خودشان را می‌سازند.
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
