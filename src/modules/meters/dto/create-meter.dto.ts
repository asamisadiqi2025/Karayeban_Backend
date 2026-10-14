import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
} from 'class-validator';
import { MeterStatus } from '@prisma/client';

export class CreateMeterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  shopNumber: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  serialNumber: string;

  @IsOptional()
  @IsEnum(MeterStatus)
  status?: MeterStatus;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lastReading?: number;

  @IsOptional()
  @IsDateString()
  lastReadingDate?: string;

  // فقط برای SUPER_ADMIN: ساخت کنتور زیر یک بازار مشخص.
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
