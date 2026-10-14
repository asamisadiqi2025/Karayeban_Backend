import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CreateCurrencyDto {
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, {
    message: 'code must be a 3-letter ISO 4217 currency code',
  })
  code: string;

  // فقط برای SUPER_ADMIN: فعال‌کردن این ارز برای یک مارکت مشخص. برای نقش‌های دیگر
  // نادیده گرفته می‌شود و مارکت از روی کاربر جاری تعیین می‌گردد.
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
