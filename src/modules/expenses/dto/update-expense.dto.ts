import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateExpenseDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsUUID()
  accountId?: string;

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

  // اختیاری — تصحیحِ دستیِ نرخِ همین مصرف؛ مثل تغییرِ مبلغ، ذکرِ reason الزامی است.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  exchangeRate?: number;

  @IsOptional()
  @IsString()
  receiptImage?: string;

  // وقتی مبلغ یا حساب عوض می‌شود اجباری است (سرویس چک می‌کند) — تصحیحِ یک مصرفِ
  // مالی باید یک دلیلِ مکتوب در audit trail داشته باشد، نه فقط عددِ قبل/بعد.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
