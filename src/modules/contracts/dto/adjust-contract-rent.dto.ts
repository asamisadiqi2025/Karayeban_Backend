import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

// تخفیف/تغییر کرایه از وسط قرارداد. فقط فاکتورهای آینده و پرداخت‌نشده (PENDING/OVERDUE)
// با نرخ جدید بازمحاسبه می‌شوند؛ ماه‌های قبلاً پرداخت‌شده دست نمی‌خورند و Contract.rent
// (رقم امضاشدهٔ اصلی) تغییر نمی‌کند.
//
// قاعده‌های بازه و سقف:
//  - newRent هیچ‌وقت نمی‌تواند از Contract.rent (کرایهٔ امضاشده) بیشتر باشد؛ برگرداندن به «کرایهٔ
//    عادی» یعنی newRent = Contract.rent.
//  - effectiveTo (اختیاری): فقط دوره‌هایی که «شروع»شان در بازهٔ [effectiveFrom, effectiveTo) باشد تغییر
//    می‌کنند و دوره‌های از effectiveTo به بعد دست‌نخورده می‌مانند. دوره‌ها ماهِ کامل‌اند (هر دوره از
//    روز شروعِ خودِ قرارداد حساب می‌شود)؛ پس تاریخِ وسطِ دوره، آن دورهٔ دربرگیرنده را کامل تغییر نمی‌دهد
//    (effectiveFrom) یا کامل در بر می‌گیرد (effectiveTo). بدون effectiveTo تا آخر قرارداد اعمال می‌شود.
//  - reason اجباری است (این تغییر مبلغِ قابل‌وصول را کم می‌کند و باید دلیلش ثبت شود).
export class AdjustContractRentDto {
  @IsNumber()
  @IsPositive()
  newRent: number;

  @IsDateString()
  effectiveFrom: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
