import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateElectricityBillDto {
  // قرارداد فعلیِ دوکان/مستأجر — periodStart/periodEnd از روی این + سال + شمارهٔ دوره،
  // طبق ElectricityBillingCycle بازار همان قرارداد، محاسبه می‌شود (آزاد فرستاده نمی‌شود).
  @IsUUID()
  contractId: string;

  @IsInt()
  @Min(1000)
  year: number;

  @IsInt()
  @Min(1)
  periodNumber: number;

  // برای بل‌های زنده (isOpeningEntry نه) الزامی است — previousReading از meter.lastReading
  // خوانده می‌شود، currentReading همینجا لازم است.
  @IsOptional()
  @IsUUID()
  meterId?: string;

  // فقط override دستیِ درجهٔ قبلی — معمولاً لازم نیست، سرور خودش از meter.lastReading
  // می‌خواند. فقط وقتی بفرستید که رقم سیستم اشتباه/قدیمی است.
  @IsOptional()
  @IsNumber()
  previousReading?: number;

  // برای بل‌های زنده الزامی است — درجه‌ای که همین الان از کنتور خوانده شده.
  @IsOptional()
  @IsNumber()
  currentReading?: number;

  // اختیاری: اگر نفرستید، سرور خودش (currentReading − previousReading) × نرخ برق مارکت
  // را حساب می‌کند. فقط برای مواردی که محاسبهٔ خودکار درست نیست (تخفیف خاص، توافق دستی،
  // یا isOpeningEntry که اصلاً رقم کنتور معلوم نیست) دستی بفرستید.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  totalAmount?: number;

  @IsUUID()
  currencyId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // برای بل‌هایی که از دفتر کاغذی مهاجرت شده‌اند (قبل از راه‌اندازی سیستم).
  @IsOptional()
  @IsBoolean()
  isOpeningEntry?: boolean;

  // فقط وقتی isOpeningEntry=true معنی دارد: مبلغی که طبق دفتر کاغذی از قبل پرداخت شده.
  // برای بل‌های زنده، پرداخت همیشه از مسیر createPayment (با تخصیص FIFO) ثبت می‌شود.
  @IsOptional()
  @IsNumber()
  @Min(0)
  paidAmount?: number;

  // برای قرائتِ نهاییِ روزِ فسخ/تحویل دوکان (نه پایانِ طبیعیِ دوره): اگر بدهید و زودتر از
  // پایانِ طبیعیِ دوره باشد، periodEnd همین تاریخ می‌شود — بل دقیقاً تا همین لحظه بسته
  // می‌شود، نه تا آخر دوره. نفرستید = رفتار عادی (periodEnd = پایان طبیعیِ دوره).
  @IsOptional()
  @IsDateString()
  readingDate?: string;
}
