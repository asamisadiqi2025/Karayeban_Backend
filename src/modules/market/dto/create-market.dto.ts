import { IsOptional, IsString } from 'class-validator';

export class CreateMarketDto {
  @IsString()
  name: string;

  @IsString()
  address: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  baseCurrency?: string;
}
