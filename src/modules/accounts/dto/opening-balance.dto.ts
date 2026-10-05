import { IsDateString, IsNumber, IsOptional } from 'class-validator';

export class CreateOpeningBalanceDto {
  @IsNumber()
  amount: number;

  @IsOptional()
  @IsDateString()
  openingDate?: string;

  // اختیاری — نرخِ دستیِ همین افتتاحیه (۱ واحد ارز حساب = X واحد ارز پایه). اگر نیاید، نرخِ ثبت‌شدهٔ
  // مارکت تا تاریخِ افتتاحیه استفاده می‌شود؛ اگر آن هم نبود، ساختِ حساب با موجودیِ افتتاحیه رد می‌شود.
  @IsOptional()
  @IsNumber()
  exchangeRate?: number;

  // منسوخ: معادلِ ارز پایه را همیشه سرور حساب می‌کند (مبلغ × نرخ)؛ این فیلد فقط برای سازگاریِ
  // کلاینت‌های قدیمی پذیرفته می‌شود و نادیده گرفته می‌شود.
  @IsOptional()
  @IsNumber()
  baseCurrencyAmount?: number;
}
