import { ArrayUnique, IsArray, IsOptional, IsString } from 'class-validator';

export class CreateMarketDto {
  @IsString()
  name: string;

  @IsString()
  address: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsString()
  baseCurrency: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  phones?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  emails?: string[];
}
