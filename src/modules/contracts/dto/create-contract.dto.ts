import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateContractDto {
  @IsUUID()
  shopId: string;

  @IsUUID()
  tenantId: string;

  @IsOptional()
  @IsUUID()
  guarantorId?: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsNumber()
  @IsPositive()
  rent: number;

  @IsUUID()
  currencyId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // امانت (اختیاری) — جدا از کرایه، فقط ذخیره می‌شود؛ خودکار خرج فاکتور نمی‌شود.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  securityDeposit?: number;

  // الزامی فقط وقتی securityDeposit داده شده و افتتاحیه نیست (یعنی پول همین الان دریافت می‌شود).
  @ValidateIf(
    (dto: CreateContractDto) =>
      !!dto.securityDeposit && !dto.securityDepositIsOpeningEntry,
  )
  @IsUUID()
  securityDepositAccountId?: string;

  // true = امانت قبلاً (قبل از سیستم) گرفته شده، هیچ حسابی الان افزایش نمی‌یابد.
  @IsOptional()
  @IsBoolean()
  securityDepositIsOpeningEntry?: boolean;

  // فقط برای مهاجرت قراردادهای در حال جریان: سرجمع کرایه‌ای که مستأجر از startDate
  // تا امروز داده. سیستم فاکتورهای گذشته را می‌سازد و همین مبلغ را FIFO رویشان می‌ریزد.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  openingRentPaid?: number;

  // فقط برای SUPER_ADMIN: ثبت قرارداد زیر یک بازار مشخص.
  @IsOptional()
  @IsUUID()
  marketId?: string;

  // برای دوکانی که کنتور برق دارد و مستأجرِ تازه وسطِ یک دورهٔ میترخوانی می‌آید (مثلاً
  // دوکان چند روز خالی بوده): همین لحظهٔ ساختِ قرارداد، meter.lastReading را به این عدد
  // قفل می‌کند تا اولین بلِ آیندهٔ این دوکان از همین‌جا حساب شود، نه از رقم قدیمیِ
  // به‌جامانده از مستأجر/دورهٔ قبلی. اختیاری — اگر یکی را بفرستید، آن‌یکی هم الزامی می‌شود.
  @ValidateIf((dto: CreateContractDto) => dto.meterReadingOnStart !== undefined)
  @IsUUID()
  meterId?: string;

  @ValidateIf((dto: CreateContractDto) => dto.meterId !== undefined)
  @IsNumber()
  @Min(0)
  meterReadingOnStart?: number;
}
