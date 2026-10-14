import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export class CreateDealerLoanDto {
  @IsUUID()
  dealerId: string;

  // پول از این حساب (صندوق یا هر بانک) بیرون می‌رود؛ ارزِ قرض همان ارزِ حساب است.
  @IsUUID()
  accountId: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  amount: number;

  // پیش‌فرض: همین الان.
  @IsOptional()
  @IsDateString()
  loanDate?: string;

  // تاریخی که دیلر قول داده برگرداند — به‌صورت YYYY-MM-DD. هشدار ۷ روز قبل از همین تاریخ است.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dueDate must be in YYYY-MM-DD format' })
  dueDate?: string;

  // اختیاری — نرخِ دستیِ همین قرض (۱ واحد ارز حساب = X واحد ارز پایه). اگر نیاید آخرین نرخ
  // ثبت‌شدهٔ مارکت استفاده می‌شود. نرخ سیستم هرگز با این تغییر نمی‌کند.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  exchangeRate?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  details?: string;
}
