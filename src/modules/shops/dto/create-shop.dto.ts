import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ShopType } from '@prisma/client';

export class CreateShopDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  shopNumber: string;

  @IsOptional()
  @IsUUID()
  floorId?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  area?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @IsOptional()
  @IsEnum(ShopType)
  type?: ShopType;

  @IsOptional()
  @IsString()
  details?: string;

  
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
