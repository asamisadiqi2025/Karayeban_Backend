import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaymentMethod, SettlementMethod } from '@prisma/client';

// بدهیِ نهاییِ کرایه/برق همین حالا از رکوردهای زنده محاسبه می‌شود (finalRentDebt/finalElectricityDebt
// دستی نیست) — شما فقط می‌گویید چقدرش را نقد می‌گیرید؛ باقی‌مانده طبق settlementMethod بخشیده می‌شود.
export class SettleContractDto {
  @IsEnum(SettlementMethod)
  settlementMethod: SettlementMethod;

  // پولی که همین الان نقد دریافت می‌شود. برای CASH باید دقیقاً برابر کل بدهی باشد؛
  // برای WRITE_OFF/COLLATERAL باید ۰ باشد؛ برای MIXED هر عددی بین ۰ و کل بدهی.
  @IsOptional()
  @IsNumber()
  @Min(0)
  cashAmount?: number;

  // فقط وقتی cashAmount > 0 الزامی است.
  @ValidateIf((dto: SettleContractDto) => !!dto.cashAmount)
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsDateString()
  settledAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
