import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

// پرداختِ یک‌جا برای بدهیِ برقِ تاریخی (قبل از راه‌اندازیِ سیستم) — معادلِ
// openingRentPaid در ساختِ قرارداد. حساب/دخل لمس نمی‌شود (نه ledger، نه account.balance)
// و FIFO روی همهٔ بل‌های بازِ همین دوکان (که قبلاً با isOpeningEntry از bills/bulk ساخته
// شده‌اند) تقسیم می‌شود؛ برای انتخاب یک بلِ مشخص از مسیرِ عادیِ payments با billId استفاده کنید.
export class CreateElectricityOpeningPaymentDto {
  @IsUUID()
  shopId: string;

  @IsUUID()
  tenantId: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  receiptNumber?: string;
}
