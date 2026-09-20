import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateInventoryUnitDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  symbol?: string;

  // خالی = واحد سراسری، برای همهٔ بازارها قابل‌استفاده. فقط SUPER_ADMIN می‌تواند یکی
  // صریح بفرستد؛ نقش‌های دیگر همیشه واحدِ مخصوص بازار خودشان را می‌سازند.
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
