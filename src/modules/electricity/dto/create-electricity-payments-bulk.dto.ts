import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateElectricityPaymentDto } from './create-electricity-payment.dto';

// برای روزهای جمع‌آوریِ نقدی که حساب‌دار چند رسید را یک‌جا وارد می‌کند — هر آیتم مستقل
// پردازش می‌شود، پس یک خطا بقیه را متوقف نمی‌کند. سقف ۱۰ طبق درخواست، تا یک درخواست
// اشتباه حجم زیادی پول را هم‌زمان جابه‌جا نکند.
export class CreateElectricityPaymentsBulkDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CreateElectricityPaymentDto)
  payments: CreateElectricityPaymentDto[];
}
