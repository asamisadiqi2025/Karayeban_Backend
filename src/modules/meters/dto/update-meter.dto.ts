import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import { MeterStatus } from '@prisma/client';

export class UpdateMeterDto {
  // جابه‌جایی کنتور به دوکان دیگر (مثلاً وقتی هنوز assign/merge اختصاصی نداریم) —
  // meterNumber هم خودکار با شمارهٔ دوکان جدید یکی می‌شود.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  shopNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string;

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
}
