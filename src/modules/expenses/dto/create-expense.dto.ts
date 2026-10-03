import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateExpenseDto {
  @IsUUID()
  categoryId: string;

  // اختیاری — نامِ یک سب‌کتگوریِ جدید زیرِ همین categoryId (که باید کتگوریِ مادر باشد).
  // اگر زیرِ این مادر سب‌کتگوریِ هم‌نام (فعال) باشد همان استفاده می‌شود، وگرنه ساخته می‌شود؛
  // ساخت و ثبتِ مصرف در یک تراکنش‌اند (همه یا هیچ).
  @IsOptional()
  @IsString()
  @MaxLength(255)
  newSubcategoryName?: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsUUID()
  accountId: string;

  @IsOptional()
  @IsDateString()
  expenseDate?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  usdEquivalent?: number;

  // اختیاری — نرخِ دستیِ همین مصرف (۱ واحد ارز حساب = X واحد ارز پایه). اگر نیاید،
  // آخرین نرخ ثبت‌شدهٔ مارکت استفاده می‌شود. نرخ سیستم (تنظیمات) هرگز با این تغییر نمی‌کند.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  exchangeRate?: number;

  @IsOptional()
  @IsString()
  receiptImage?: string;

  // فقط برای SUPER_ADMIN: ثبت مصرف زیر یک بازار مشخص. برای نقش‌های دیگر نادیده گرفته
  // می‌شود و بازار از روی کاربر جاری تعیین می‌گردد.
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
