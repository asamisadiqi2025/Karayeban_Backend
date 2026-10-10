import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

// سالِ هجری‌شمسی (مثلاً ۱۴۰۵)؛ اگر نیاید، سالِ جاریِ کابل.
export class DashboardTrendQueryDto {
  @IsOptional()
  @IsUUID()
  marketId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1300)
  @Max(1600)
  year?: number;
}
