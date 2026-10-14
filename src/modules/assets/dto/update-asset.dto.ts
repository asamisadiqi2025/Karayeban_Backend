import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { AssetStatus } from '@prisma/client';

export class UpdateAssetDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  // undefined = دست‌نخورده؛ یک UUID = دستهٔ جدید (باید فعال باشد)؛ null = برداشتنِ دسته‌بندی.
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  purchasePrice?: number;

  @IsOptional()
  @IsUUID()
  currencyId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  lifespanYears?: number;

  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;

  @IsOptional()
  @IsString()
  details?: string;
}
