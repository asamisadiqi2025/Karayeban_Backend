import { IsDateString, IsNumber, IsOptional } from 'class-validator';

export class CreateOpeningBalanceDto {
  @IsNumber()
  amount: number;

  @IsOptional()
  @IsDateString()
  openingDate?: string;

  @IsOptional()
  @IsNumber()
  exchangeRate?: number;

  @IsOptional()
  @IsNumber()
  baseCurrencyAmount?: number;
}
