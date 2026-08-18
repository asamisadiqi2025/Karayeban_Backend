import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class UpdateMarketProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  baseCurrency?: string;

  @IsOptional()
  exchangeRate?: number;

  @IsOptional()
  @IsBoolean()
  hasWater?: boolean;
}
 