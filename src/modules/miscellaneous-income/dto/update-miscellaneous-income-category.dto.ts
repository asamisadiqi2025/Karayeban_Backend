import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMiscellaneousIncomeCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  // فعال/غیرفعال کردن فقط توسط ادمین (یا سوپرادمین). کتگوری/سب‌کتگوریِ غیرفعال دیگر
  // عایدیِ جدید نمی‌پذیرد، ولی عایدی‌های قبلی‌اش دست‌نخورده می‌مانند.
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isActive?: boolean;

  // جابه‌جاییِ دسته‌بندی بین والدها ممنوع است (گزارش‌های قبلی را عوض می‌کند). این فیلد فقط برای
  // اینکه پیامِ واضحی بدهیم پذیرفته می‌شود و سرویس هر مقداری را رد می‌کند.
  @IsOptional()
  parentId?: string | null;
}
