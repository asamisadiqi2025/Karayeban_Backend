import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

// موجودی افتتاحیهٔ کالا — برای وقتی که کالا از قبل به تعداد و ارزش مشخصی موجود است
// (نه یک خرید تازه از حساب بانکی) و می‌خواهید همان لحظهٔ ساخت کالا ثبتش کنید،
// دقیقاً مثل CreateOpeningBalanceDto برای Account.
export class CreateOpeningStockDto {
  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsNumber()
  @IsPositive()
  unitCost: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
