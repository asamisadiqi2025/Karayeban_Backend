import { IsDateString } from 'class-validator';

// گزارش دورهٔ یک حساب، مثل صورت‌حساب بانکی: موجودی اول دوره + لیست تراکنش‌ها
// در [from, to] + موجودی بعد از هر تراکنش + موجودی آخر دوره.
export class AccountStatementQueryDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}
