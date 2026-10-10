import { PaymentMethod, PaymentSourceType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ElectricityPaymentQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  shopId?: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  // ---- فیلترهای بیشتر (همه اختیاری؛ بدونِ هیچ‌کدام رفتار قبلی عیناً همان است) ----

  // پرداخت‌هایی که روی بل‌های این قرارداد نشسته‌اند (پرداخت مستقیماً قرارداد ندارد؛ از تخصیص‌هایش).
  @IsOptional()
  @IsUUID()
  contractId?: string;

  // پرداخت‌هایی که روی این بلِ مشخص نشسته‌اند.
  @IsOptional()
  @IsUUID()
  billId?: string;

  // سال و دورهٔ میترخوانیِ بلی که پرداخت روی آن نشسته. اگر با contractId/billId هم بیایند، همگی روی
  // «یک» بل اعمال می‌شوند.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(3000)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  periodNumber?: number;

  @IsOptional()
  @IsUUID()
  floorId?: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsUUID()
  currencyId?: string;

  // دریافت‌کننده (کاربری که پرداخت را ثبت کرده).
  @IsOptional()
  @IsUUID()
  collectedById?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  // BANK یا SECURITY_DEPOSIT (از محل امانتِ قرارداد).
  @IsOptional()
  @IsEnum(PaymentSourceType)
  source?: PaymentSourceType;

  // true = فقط پرداخت‌های مهاجرت‌شده از دفتر کاغذی، false = فقط پرداخت‌های زنده.
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isOpeningEntry?: boolean;

  // بازهٔ تاریخِ پرداخت (روزِ کابل، هر دو سر شامل). هر دو اختیاری‌اند.
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  // search (از PaginationQueryDto): نامِ مستأجر، شمارهٔ دوکان، شمارهٔ رسید، یادداشت.
}
