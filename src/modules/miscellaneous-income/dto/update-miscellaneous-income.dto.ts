import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateMiscellaneousIncomeDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  description?: string;

  // اختیاری — تصحیحِ دستیِ نرخِ همین عایدی؛ مثل تغییرِ مبلغ، ذکرِ reason الزامی است.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  exchangeRate?: number;

  // وقتی مبلغ، حساب یا نرخ عوض می‌شود اجباری است (سرویس چک می‌کند) — تصحیحِ یک عایدیِ مالی
  // باید یک دلیلِ مکتوب در audit trail داشته باشد، نه فقط عددِ قبل/بعد.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
