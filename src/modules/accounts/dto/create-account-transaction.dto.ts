import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { AccountTransactionType } from '@prisma/client';

export class CreateAccountTransactionDto {
  @IsEnum(AccountTransactionType)
  type: AccountTransactionType;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsDateString()
  transactionDate?: string;

  // اختیاری — override دستیِ نرخ روز (وگرنه از آخرین نرخ ثبت‌شدهٔ مارکت برای ارز این
  // حساب استفاده می‌شود). قرارداد rateToBase همان ExchangeRate است: «۱ واحد ارز این
  // حساب = exchangeRate واحد ارز پایهٔ مارکت» — نه برعکس. baseCurrencyAmount را خودِ
  // سرویس از amount × نرخ حساب می‌کند؛ کلاینت نباید آن را بفرستد.
  @IsOptional()
  @IsNumber()
  exchangeRate?: number;

  @IsOptional()
  @IsString()
  details?: string;
}
