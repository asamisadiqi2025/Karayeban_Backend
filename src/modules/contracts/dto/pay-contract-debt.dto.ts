import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

// پرداخت ترکیبیِ کرایه + برق از یک حساب و یک رسید — به‌جای دو بار مراجعه به دو بخش جدا.
// حداقل یکی از rentAmount/electricityAmount باید مثبت باشد؛ هرکدام که صفر/خالی بماند
// اصلاً لمس نمی‌شود (نه RentPayment نه ElectricityPayment برایش ساخته می‌شود).
export class PayContractDebtDto {
  @IsUUID()
  accountId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rentAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  electricityAmount?: number;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  receiptNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
