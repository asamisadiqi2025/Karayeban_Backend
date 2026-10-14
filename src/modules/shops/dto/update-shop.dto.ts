import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ShopType } from '@prisma/client';

export class UpdateShopDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  shopNumber?: string;

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
  @IsBoolean()
  isActive?: boolean;
}
