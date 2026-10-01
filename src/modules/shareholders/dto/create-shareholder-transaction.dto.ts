import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ShareholderTransactionType } from '@prisma/client';

export class CreateShareholderTransactionDto {
  @IsEnum(ShareholderTransactionType)
  type: ShareholderTransactionType;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsUUID()
  accountId: string;

  // اختیاری — نرخِ دستیِ همین تراکنش (۱ واحد ارز حساب = X واحد ارز پایه). اگر نیاید،
  // آخرین نرخ ثبت‌شدهٔ مارکت استفاده می‌شود. نرخ سیستم هرگز با این تغییر نمی‌کند.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  exchangeRate?: number;

  @IsOptional()
  @IsDateString()
  transactionDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  receiptNumber?: string;

  @IsOptional()
  @IsString()
  details?: string;
}
