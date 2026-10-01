import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateShopDto } from './create-shop.dto';

// برای وقتی یک مارکت تازه راه‌اندازی می‌شود و ده‌ها دوکان یک‌جا باید ثبت شوند — هر آیتم
// کاملاً مستقل پردازش می‌شود (عیناً الگوی bills/bulk برق)، پس اگر یکی خطا داشت (مثلاً
// شماره‌ی تکراری) بقیه ذخیره می‌شوند؛ نتیجه در created/failed برمی‌گردد.
export class CreateShopsBulkDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CreateShopDto)
  shops: CreateShopDto[];
}
