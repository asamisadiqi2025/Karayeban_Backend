import {
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

// بخشیدنِ یک مبلغِ مشخص از بدهیِ موجودِ این قرارداد (نه تغییرِ نرخِ آینده — آن adjust-rent
// است). روی قدیمی‌ترین فاکتورهای باز اعمال می‌شود، حتی اگر PARTIAL باشند (چیزی رویشان
// پرداخت شده)؛ برخلاف adjust-rent که عمداً فاکتورهای PARTIAL را دست نمی‌زند.
// فقط از بدهیِ «سررسیدشده» (periodStart رسیده) می‌بخشد، نه از کرایهٔ ماه‌های آینده. reason اجباری است.
export class DiscountDebtDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
