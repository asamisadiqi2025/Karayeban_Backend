import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateMarketDto {
  @IsString()
  name: string;

  @IsString()
  address: string;

  // ساب‌دومین ورود این مارکت (مثلاً "almassharq" برای almassharq.karayehban.com).
  // فقط سوپرادمین موقع ساخت مارکت تعیینش می‌کند و بعداً از این مسیر قابل تغییر نیست،
  // چون تنظیم DNS/زیرساخت واقعی این ساب‌دومین همان لحظه باید دستی انجام شود.
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(63)
  @Matches(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, {
    message:
      'subdomain فقط می‌تواند شامل حروف کوچک لاتین، عدد و خط تیره باشد و نباید با خط تیره شروع/تمام شود',
  })
  subdomain: string;

  @IsOptional()
  @IsString()
  logo?: string;

  // اختیاری: اگر همین‌جا مشخص شود، مارکت آماده تحویل می‌شود؛ وگرنه ادمینِ مارکت
  // با اولین ورودش از PATCH /markets/:id/profile یک‌بار خودش تعیینش می‌کند.
  @IsOptional()
  @IsString()
  baseCurrency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;
}
