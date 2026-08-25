import { ArrayUnique, IsArray, IsOptional, IsString } from 'class-validator';

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

  // کل آرایه جایگزین می‌شود؛ برای اضافه/حذف یک شماره، آرایهٔ کامل و به‌روزشده را بفرستید.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  phones?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  emails?: string[];
}
 