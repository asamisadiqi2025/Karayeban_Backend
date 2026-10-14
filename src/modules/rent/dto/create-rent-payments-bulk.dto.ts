import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateRentPaymentDto } from './create-rent-payment.dto';

// برای روزِ جمع‌آوریِ کرایه که حسابدار چند رسید را یک‌جا وارد می‌کند (قراردادها/مستأجرهای مختلف) —
// عیناً همان الگوی POST /electricity/payments/bulk: هر آیتم کاملاً مستقل و با تراکنشِ خودش پردازش
// می‌شود، پس خطای یکی بقیه را متوقف نمی‌کند؛ نتیجه در created/failed برمی‌گردد. سقفِ ۱۰ تا، تا یک
// درخواستِ اشتباه حجمِ زیادی پول را هم‌زمان جابه‌جا نکند.
export class CreateRentPaymentsBulkDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CreateRentPaymentDto)
  payments: CreateRentPaymentDto[];
}
