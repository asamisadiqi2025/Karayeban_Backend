import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateExpenseCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  // فعال/غیرفعال کردن فقط توسط ادمین (یا سوپرادمین). کتگوری/سب‌کتگوری غیرفعال دیگر
  // مصرفِ جدید نمی‌پذیرد، ولی مصرف‌های قبلی‌اش دست‌نخورده می‌مانند.
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isActive?: boolean;

  // جابه‌جاییِ کتگوری بین والدها ممنوع است (گزارش‌های قبلی را عوض می‌کند). این فیلد فقط برای
  // اینکه پیامِ واضحی بدهیم پذیرفته می‌شود و سرویس هر مقداری را رد می‌کند.
  @IsOptional()
  parentId?: string | null;
}
