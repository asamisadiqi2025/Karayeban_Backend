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

  // پیش‌فرض: اگر بعد از محاسبهٔ فسخ هنوز بدهیِ بازِ کرایه یا برق مانده باشد، فسخ ۴۰۹ می‌دهد و باید اول تسویه شود
  // (از امانت: POST /contracts/:id/pay-from-deposit، یا نقد: POST /contracts/:id/pay-debt). فقط وقتی مستأجر
  // رفته و پرداخت نمی‌کند، ادمین با acknowledgeDebt=true (و reason اجباری) قرارداد را «با بدهیِ باز» فسخ می‌کند؛
  // بدهی روی مستأجر می‌ماند (قابل پیگیری) و بخشیده نمی‌شود.
  @IsOptional()
  @IsBoolean()
  acknowledgeDebt?: boolean;

  // تاریخِ قولِ پرداخت (روزِ تقویمی، YYYY-MM-DD؛ امروز یا بعد). وقتی acknowledgeDebt=true الزامی است: بدهی روی
  // مستأجر می‌ماند و در «فهرستِ پیگیری» (GET /debt-promises) می‌آید؛ اگر تاریخ گذشت و پرداخت نشد، عقب‌افتاده می‌شود.
  @IsOptional()
  @IsDateString()
  promisedPaymentDate?: string;
}
