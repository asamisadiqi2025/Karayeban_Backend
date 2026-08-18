import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateMarketDto {
  @IsString()
  name: string;

  @IsString()
  address: string;

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
