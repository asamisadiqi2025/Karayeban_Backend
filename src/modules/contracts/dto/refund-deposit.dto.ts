import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator';

// برگرداندنِ (همهٔ یا بخشی از) امانتِ باقی‌ماندهٔ قرارداد به مستأجر — فقط بعد از فسخ/پایانِ قرارداد و فقط وقتی هیچ
// بدهیِ بازِ کرایه یا برق نمانده. پول از accountId کم می‌شود (ledger از نوعِ OUT) و securityDepositRemaining کم می‌شود.
export class RefundDepositDto {
  // حسابی که پول از آن به مستأجر پرداخت می‌شود؛ باید هم‌بازار، فعال، و هم‌ارزِ قرارداد باشد و موجودی کافی داشته باشد.
  @IsUUID()
  accountId: string;

  // نفرستید = کلِ امانتِ باقی‌مانده.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsDateString()
  refundDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
