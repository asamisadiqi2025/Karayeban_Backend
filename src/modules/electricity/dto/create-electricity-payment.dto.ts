import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { PaymentMethod, PaymentSourceType } from '@prisma/client';

export class CreateElectricityPaymentDto {
  @IsUUID()
  shopId: string;

  @IsUUID()
  tenantId: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  // پیش‌فرض BANK. SECURITY_DEPOSIT یعنی از امانتِ قرارداد فعلیِ همین مستأجر/دوکان کم شود.
  @IsOptional()
  @IsEnum(PaymentSourceType)
  source?: PaymentSourceType;

  @ValidateIf(
    (dto: CreateElectricityPaymentDto) =>
      dto.source !== PaymentSourceType.SECURITY_DEPOSIT,
  )
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  receiptNumber?: string;
}
