import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class FinancialSummaryQueryDto {
  @IsOptional()
  @IsUUID()
  marketId?: string;

  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}
