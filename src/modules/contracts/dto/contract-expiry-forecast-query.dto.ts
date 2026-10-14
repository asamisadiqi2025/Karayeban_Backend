import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

// فهرستِ قراردادهای فعالی که تا withinDays روزِ آینده منقضی می‌شوند — برای برنامه‌ریزیِ
// تمدید، قبل از اینکه دوکان بدونِ خبرِ قبلی خالی بماند.
export class ContractExpiryForecastQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  marketId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  withinDays?: number = 30;
}
