import { IsDateString, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

// تسویهٔ بدهی «از محل امانتِ (پیش‌پرداختِ) مستأجر» — مبلغِ کرایه و مبلغِ برق جداگانه و دستی وارد می‌شود (هیچ‌چیز
// خودکار تقسیم نمی‌شود). هر بخش یک پرداختِ مستقل با رسیدِ خودش می‌سازد (source=SECURITY_DEPOSIT) و فقط
// securityDepositRemaining کم می‌شود؛ پولی از هیچ حسابی جابه‌جا نمی‌شود (پولِ امانت از قبل در حساب است).
// حداقل یکی از rentAmount/electricityAmount باید مثبت باشد؛ هر کدام خالی/صفر بماند اصلاً لمس نمی‌شود.
// اگر امانت کافی نبود، باقیِ بدهی را مستأجر نقد می‌دهد: POST /contracts/:id/pay-debt.
export class PayFromDepositDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  rentAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  electricityAmount?: number;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
