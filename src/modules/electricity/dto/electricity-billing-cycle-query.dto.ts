import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ElectricityBillingCycleQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  year?: number;

  @IsOptional()
  @IsUUID()
  marketId?: string;
}
