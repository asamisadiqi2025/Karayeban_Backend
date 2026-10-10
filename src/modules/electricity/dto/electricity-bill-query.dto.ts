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
import { ElectricityBillStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ElectricityBillQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  shopId?: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsEnum(ElectricityBillStatus)
  status?: ElectricityBillStatus;

  // ---- فیلترهای بیشتر (همه اختیاری؛ بدونِ هیچ‌کدام رفتار قبلی عیناً همان است) ----

  // یک قرارداد مشخص.
  @IsOptional()
  @IsUUID()
  contractId?: string;

  // یک کنتور مشخص.
  @IsOptional()
  @IsUUID()
  meterId?: string;

  // یک دورهٔ میترخوانیِ تنظیم‌شده (GET /electricity/billing-cycles).
  @IsOptional()
  @IsUUID()
  billingCycleId?: string;

  // طبقه: بل‌های دوکان‌های همان طبقه.
  @IsOptional()
  @IsUUID()
  floorId?: string;

  @IsOptional()
  @IsUUID()
  currencyId?: string;

  // سالِ هجری‌شمسی (مثلاً ۱۴۰۵) و شمارهٔ دورهٔ میترخوانی (مثلاً ۳ = «دورهٔ سوم»). مستقل‌اند: اگر فقط
  // periodNumber بدهید، همان دوره در همهٔ سال‌ها می‌آید.
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

  // true = فقط بل‌های مهاجرت‌شده از دفتر کاغذی، false = فقط بل‌های زنده.
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isOpeningEntry?: boolean;

  // true = مبلغ را کاربر دستی داده (تخفیف/توافق/بل کاغذی). false = فقط بل‌هایی که «مطمئناً»
  // محاسبهٔ خودکار بوده‌اند؛ بل‌های قدیمیِ قبل از ثبتِ این علامت (نامعلوم) در هیچ‌کدام نمی‌آیند.
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isManualAmount?: boolean;

  // بازهٔ تاریخ (روزِ تقویمی، هر دو سر شامل): بل‌هایی که دورهٔ آن‌ها با این بازه همپوشانی دارد.
  // هر دو اختیاری‌اند (فقط fromDate یا فقط toDate هم می‌شود).
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  // search (از PaginationQueryDto): نامِ مستأجر، شمارهٔ دوکان، شمارهٔ/سریالِ کنتور، یادداشت.
}
