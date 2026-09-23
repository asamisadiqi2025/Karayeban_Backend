import { IsOptional, IsUUID } from 'class-validator';

// اسنپ‌شاتِ همین‌الانِ سنِ بدهیِ برق — periodEnd هر بل ثابت است، پس «چند روز گذشته»
// همیشه نسبت به لحظهٔ درخواست حساب می‌شود، نه یک بازهٔ ورودی. دقیقاً هم‌شکلِ
// RentDebtAgingQueryDto (src/modules/rent/dto/rent-debt-aging-query.dto.ts).
export class ElectricityDebtAgingQueryDto {
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
