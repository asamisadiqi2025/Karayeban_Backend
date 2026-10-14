import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
} from 'class-validator';

// ثبت/به‌روزرسانی نرخ روزِ یک ارز نسبت به ارز پایهٔ مارکت.
// اگر همان روز قبلاً نرخی برای همین ارز ثبت شده باشد، جایگزین می‌شود (نه یک ردیف جدید)؛
// روزهای قبلی دست‌نخورده در تاریخچه می‌مانند.
export class UpdateExchangeRateDto {
  @IsUUID()
  currencyId: string;

  // «۱ واحد این ارز = rateToBase واحد ارز پایهٔ مارکت»
  @IsNumber()
  @IsPositive()
  rateToBase: number;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  // اگر نرخِ جدید بیش از ۲۵٪ (در هر جهت) با نرخِ قبلی/بعدیِ همین ارز فاصله داشته باشد، سرور برای
  // جلوگیری از خطای تایپی ۴۰۹ می‌دهد؛ با true فرستادنِ این فیلد، ثبت آگاهانه تأیید می‌شود.
  @IsOptional()
  @IsBoolean()
  confirmLargeChange?: boolean;
}
