import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

// ثبتِ دستیِ تعهدِ پرداخت (مستأجری که بدونِ فسخ/تمدید می‌گوید «تا فلان تاریخ می‌دهم»). بدهیِ تعهد همان
// کرایهٔ سررسیدشده + برقِ بازِ همین مستأجر در همین لحظه است. اگر مستأجر تعهدِ بازی دارد، جایگزین می‌شود.
export class CreateDebtPromiseDto {
  @IsUUID()
  tenantId: string;

  // روزِ وعده (۱۰ حرفِ اول، YYYY-MM-DD)؛ امروز یا بعد از آن.
  @IsDateString()
  promisedDate: string;

  @IsString()
  @IsNotEmpty()
  reason: string;

  // فقط برای SUPER_ADMIN.
  @IsOptional()
  @IsUUID()
  marketId?: string;
}

// مستأجر تاریخ را عقب می‌اندازد: تاریخِ تازه + دلیل. (سابقه در Audit Log می‌ماند.)
export class RescheduleDebtPromiseDto {
  @IsDateString()
  promisedDate: string;

  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class CancelDebtPromiseDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

// فهرستِ پیگیری. پیش‌فرض فقط تعهدهای باز (OPEN)، به‌ترتیبِ نزدیک‌ترین تاریخِ وعده.
export class DebtPromiseQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['OPEN', 'FULFILLED', 'CANCELLED', 'ALL'])
  status?: 'OPEN' | 'FULFILLED' | 'CANCELLED' | 'ALL';

  // true = فقط عقب‌افتاده‌ها (تاریخِ وعده گذشته و هنوز بدهی مانده) — «لیستِ پیگیری».
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  overdue?: boolean;

  // فقط وعده‌هایی که تا N روزِ آینده سررسید می‌شوند (برای یادآوری).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dueWithinDays?: number;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  // فقط برای SUPER_ADMIN.
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
