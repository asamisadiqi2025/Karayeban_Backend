import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

// تخفیف/تغییر کرایه از وسط قرارداد. فقط فاکتورهای آینده و پرداخت‌نشده (PENDING/OVERDUE)
// با نرخ جدید بازمحاسبه می‌شوند؛ ماه‌های قبلاً پرداخت‌شده دست نمی‌خورند و Contract.rent
// (رقم امضاشدهٔ اصلی) تغییر نمی‌کند.
export class AdjustContractRentDto {
  @IsNumber()
  @IsPositive()
  newRent: number;

  @IsDateString()
  effectiveFrom: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
