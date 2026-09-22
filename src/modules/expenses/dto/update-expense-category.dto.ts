import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class UpdateExpenseCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isActive?: boolean;

  // undefined = دست‌نخورده؛ یک UUID = والدِ جدید (تبدیل به/جابه‌جاییِ سب‌کتگوری)؛
  // null = جدا کردن از والد (تبدیل به کتگوریِ مادرِ مستقل).
  @ValidateIf((o: UpdateExpenseCategoryDto) => o.parentId !== null)
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}
