import { IsOptional, IsString, Matches } from 'class-validator';

export class UpdateDealerLoanDto {
  // undefined = دست‌نخورده؛ تاریخ (YYYY-MM-DD) = سررسیدِ جدید (مثلاً دیلر وعدهٔ تازه داد)؛
  // null = برداشتنِ سررسید. فقط برای قرضِ باز.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dueDate must be in YYYY-MM-DD format' })
  dueDate?: string | null;

  @IsOptional()
  @IsString()
  details?: string;
}
