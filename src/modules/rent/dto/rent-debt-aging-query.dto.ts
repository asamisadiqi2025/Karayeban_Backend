import { IsOptional, IsUUID } from 'class-validator';

// اسنپ‌شاتِ همین‌الانِ سنِ بدهیِ کرایه — periodEnd هر فاکتور ثابت است، پس «چند روز
// گذشته» همیشه نسبت به لحظهٔ درخواست حساب می‌شود، نه یک بازهٔ ورودی.
export class RentDebtAgingQueryDto {
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
