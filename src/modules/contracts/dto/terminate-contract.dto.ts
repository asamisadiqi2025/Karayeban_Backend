import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';

export class TerminateContractDto {
  @IsDateString()
  terminationDate: string;

  @IsOptional()
  @IsString()
  reason?: string;

  // پیش‌فرض true (رفتار قبلی، دست‌نخورده): فاکتورِ ماهی که وسطش فسخ می‌شود به تعداد
  // روزهای واقعی تقسیم می‌شود. false = همان فاکتور کامل (کل ماه) می‌ماند — برای بازارهایی
  // که طبق توافق، کرایه‌ی ماهی که تخلیه در آن اتفاق افتاده را کامل می‌گیرند. در هر دو حالت،
  // terminationDate عیناً همان تاریخ واقعی ثبت می‌شود و فاکتورهای بعد از آن لغو می‌شوند.
  @IsOptional()
  @IsBoolean()
  prorate?: boolean;
}
