import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateExpenseDto {
  @IsUUID()
  categoryId: string;

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
