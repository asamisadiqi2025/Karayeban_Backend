import { IsDateString, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

// فقط فیصد همین یک سهام‌دار را ثبت می‌کند — بدون هیچ چک ریاضی‌ای رو بقیهٔ سهام‌داران.
// جمع‌کل فیصدهای فعال، تعمداً اینجا enforce نمی‌شود؛ محاسبهٔ نهایی با حساب‌دار است.
export class SetShareholderEquityDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage: number;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
