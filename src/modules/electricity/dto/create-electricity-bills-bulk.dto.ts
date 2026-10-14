import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateElectricityBillDto } from './create-electricity-bill.dto';

// برای یک دورِ میترخوانی که همزمان چند دوکان را پوشش می‌دهد — هر آیتم کاملاً مستقل پردازش
// می‌شود (هرکدام تراکنش خودش را دارد)، پس اگر یکی خطا داشت بقیه ذخیره می‌شوند؛ نتیجه در
// created/failed برمی‌گردد. سقف ۱۰ طبق روال واقعیِ حسابدار (۱۰تا۱۰تا میترخوانی می‌کند).
export class CreateElectricityBillsBulkDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CreateElectricityBillDto)
  bills: CreateElectricityBillDto[];
}
