import { IsEmail, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class UpdateMarketProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  baseCurrency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  details?: string;

  // نرخ برق (به‌ازای هر واحد مصرف) — همهٔ بل‌های تولیدشده از دورهٔ میترخوانیِ دسته‌جمعی
  // همین عدد را استفاده می‌کنند تا هر بار مجبور نباشید وارد کنید.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  electricityRatePerUnit?: number;
}
