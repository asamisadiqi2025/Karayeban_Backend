import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

// تمدید = بستن قرارداد فعلی روی تاریخ پایانش + ساخت قرارداد جدیِ پیوسته (بدون خالی‌شدن دوکان).
// بدهیِ کرایه/برقِ قبلی خودکار منتقل می‌ماند چون RentDebt/ElectricityDebt بر مبنای tenantId
// جمع می‌شوند، نه contractId — نیازی به فیلد جدا برای «انتقال بدهی» نیست.
export class RenewContractDto {
  @IsDateString()
  newEndDate: string;

  // اگر ندهید، کرایهٔ قرارداد قبلی عیناً ادامه پیدا می‌کند.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  rent?: number;

  // اگر بدهید، مستأجر را در همین عملیات به دوکانِ دیگری منتقل می‌کند — دوکانِ قدیمی
  // آزاد می‌شود، دوکانِ جدید اشغال. اگر ندهید، دقیقاً همان دوکانِ قبلی ادامه پیدا می‌کند.
  @IsOptional()
  @IsUUID()
  shopId?: string;

  @IsOptional()
  @IsUUID()
  guarantorId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // تمدید با بدهیِ باز (مثلاً مستأجر پول کامل ندارد): فقط با اجازهٔ ادمین (یا کسی که دسترسیِ
  // contracts.allow_debt دارد)، همراهِ دلیل و تاریخِ قولِ پرداخت. بدهی روی مستأجر می‌ماند، با پرداخت‌های بعدی
  // تسویه می‌شود و تا آن موقع در فهرستِ پیگیری (GET /debt-promises) است. بدونِ این، تمدیدِ بدهکار ۴۰۹ می‌دهد.
  @IsOptional()
  @IsBoolean()
  acknowledgeDebt?: boolean;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsDateString()
  promisedPaymentDate?: string;
}
