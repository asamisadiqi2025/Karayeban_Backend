import { IsIn, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

// طول‌های مجاز دوره: باید ۱۲ ماه سال را بدون باقی‌مانده تقسیم کنند (۱=ماهانه، ۲=دوماه‌به‌دوماه، ...).
export const ALLOWED_MONTHS_PER_PERIOD = [1, 2, 3, 4, 6, 12] as const;

export class CreateElectricityBillingCycleDto {
  @IsInt()
  @Min(1000)
  year: number;

  @IsIn(ALLOWED_MONTHS_PER_PERIOD)
  monthsPerPeriod: number;

  @IsOptional()
  @IsUUID()
  marketId?: string;
}
