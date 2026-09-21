import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

// بخشیدنِ یک مبلغِ مشخص از بدهیِ موجودِ این قرارداد (نه تغییرِ نرخِ آینده — آن adjust-rent
// است). روی قدیمی‌ترین فاکتورهای باز اعمال می‌شود، حتی اگر PARTIAL باشند (چیزی رویشان
// پرداخت شده)؛ برخلاف adjust-rent که عمداً فاکتورهای PARTIAL را دست نمی‌زند.
export class DiscountDebtDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
