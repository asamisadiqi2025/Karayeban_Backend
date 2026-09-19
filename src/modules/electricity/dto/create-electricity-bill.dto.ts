import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateElectricityBillDto {
  @IsUUID()
  shopId: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsUUID()
  meterId?: string;

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;

  @IsOptional()
  @IsNumber()
  previousReading?: number;

  @IsOptional()
  @IsNumber()
  currentReading?: number;

  @IsNumber()
  @IsPositive()
  totalAmount: number;

  @IsUUID()
  currencyId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // برای بل‌هایی که از دفتر کاغذی مهاجرت شده‌اند (قبل از راه‌اندازی سیستم).
  @IsOptional()
  @IsBoolean()
  isOpeningEntry?: boolean;

  @IsOptional()
  @IsUUID()
  marketId?: string;
}
