import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

// عمداً فقط فیلدهای «بی‌خطر» اینجا هستند — type، currencyId، marketId، balance و isSystem
// هرگز از این مسیر قابل تغییر نیستند چون یکپارچگی مالی/تاریخچهٔ حساب را می‌شکنند.
export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  accountNumber?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
