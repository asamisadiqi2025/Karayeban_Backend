import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

// گزارش دورهٔ یک حساب، مثل صورت‌حساب بانکی: موجودی اول دوره + لیست تراکنش‌ها
// در [from, to] + موجودی بعد از هر تراکنش + موجودی آخر دوره.
export class AccountStatementQueryDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  // موجودیِ در حالِ‌اجرا (balance) باید روی کلِ بازه پشتِ‌سرهم محاسبه شود، پس صفحه‌بندی
  // اینجا فقط روی خروجیِ نهایی اعمال می‌شود (نه با skip/take در دیتابیس) — جمع‌های
  // totalIn/totalOut/closingBalance همیشه روی کلِ بازه‌اند، نه فقط همین صفحه.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
