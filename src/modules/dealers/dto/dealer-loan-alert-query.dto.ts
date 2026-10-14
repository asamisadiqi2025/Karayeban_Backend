import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

// برای هشدارها و خلاصه: فقط ‘چند روز’ و (برای سوپرادمین) بازار.
export class DealerLoanAlertQueryDto {
  // «نزدیک به سررسید» یعنی تا چند روزِ دیگر؛ پیش‌فرض ۷.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  days?: number;

  // فقط برای SUPER_ADMIN.
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
