import { PaymentMethod, PaymentSourceType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export const PAYMENT_TYPES = ['RENT', 'ELECTRICITY'] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

// نوعِ پرداخت در آدرسِ جزئیات (GET /payments/:type/:id).
export enum PaymentTypeParam {
  RENT = 'rent',
  ELECTRICITY = 'electricity',
}

// فهرستِ یکپارچهٔ «همهٔ پرداخت‌های سیستم» (کرایه + برق) با یک مجموعه فیلترِ مشترک.
// همه‌چیز اختیاری است؛ بدونِ هیچ فیلتر، جدیدترین پرداخت‌ها از هر دو نوع می‌آید.
export class PaymentListQueryDto extends PaginationQueryDto {
  // فقط یک نوع. نیاید = هر دو (به شرطِ داشتنِ دسترسیِ دیدنِ هر نوع).
  @IsOptional()
  @IsIn(PAYMENT_TYPES)
  type?: PaymentType;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsUUID()
  shopId?: string;

  // کرایه: قراردادِ خودِ پرداخت؛ برق: قراردادِ بل‌هایی که پرداخت روی آن‌ها نشسته (از تخصیص‌ها).
  @IsOptional()
  @IsUUID()
  contractId?: string;

  // طبقهٔ دوکانِ پرداخت.
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
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
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
  // sortBy فقط paymentDate (پیش‌فرض) یا createdAt؛ sortOrder پیش‌فرض desc.
}
