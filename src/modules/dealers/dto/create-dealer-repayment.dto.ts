import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class CreateDealerRepaymentDto {
  // پول به این حساب برمی‌گردد؛ ارزش باید با ارزِ قرض یکی باشد.
  @IsUUID()
  accountId: string;

  // کامل یا بخشی — از باقی‌ماندهٔ قرض بیشتر نمی‌تواند باشد.
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  amount: number;

  // پیش‌فرض: همین الان؛ نمی‌تواند قبل از تاریخِ قرض باشد.
  @IsOptional()
  @IsDateString()
  repaymentDate?: string;

  // اختیاری — نرخِ دستیِ همین بازپرداخت (۱ واحد ارز قرض = X واحد ارز پایه).
  @IsOptional()
  @IsNumber()
  @IsPositive()
  exchangeRate?: number;

  @IsOptional()
  @IsString()
  details?: string;
}
