import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateMiscellaneousIncomeDto {
  @IsUUID()
  categoryId: string;

  // اختیاری — نامِ یک سب‌کتگوریِ جدید زیرِ همین categoryId (که باید کتگوریِ مادر باشد).
  // اگر زیرِ این مادر سب‌کتگوریِ هم‌نامِ (فعال) باشد همان استفاده می‌شود، وگرنه ساخته می‌شود؛
  // ساخت و ثبتِ عایدی در یک تراکنش‌اند (همه یا هیچ).
  @IsOptional()
  @IsString()
  @MaxLength(255)
  newSubcategoryName?: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  amount: number;

  // حسابِ مقصد: مبلغ به موجودی همین حساب «اضافه» می‌شود. ارزِ عایدی همیشه ارزِ همین حساب است.
  @IsUUID()
  accountId: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  description?: string;

  // اختیاری — نرخِ دستیِ همین عایدی (۱ واحد ارز حساب = X واحد ارز پایه). اگر نیاید، آخرین نرخِ
  // ثبت‌شدهٔ مارکت استفاده می‌شود. نرخِ سیستم (تنظیمات) هرگز با این تغییر نمی‌کند.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  exchangeRate?: number;

  // فقط برای SUPER_ADMIN: ثبت عایدی زیر یک بازار مشخص. برای نقش‌های دیگر نادیده گرفته می‌شود.
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
