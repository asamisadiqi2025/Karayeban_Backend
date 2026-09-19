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

export class CreateRentPaymentDto {
  @IsUUID()
  contractId: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  // پیش‌فرض BANK. SECURITY_DEPOSIT یعنی از امانتِ همان قرارداد کم شود، نه از یک حساب.
  @IsOptional()
  @IsEnum(PaymentSourceType)
  source?: PaymentSourceType;

  // فقط وقتی source=BANK (یا خالی) الزامی است.
  @ValidateIf(
    (dto: CreateRentPaymentDto) =>
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
