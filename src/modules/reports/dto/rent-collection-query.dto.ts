import { IsDateString, IsOptional, IsUUID } from 'class-validator';

// عملکردِ جمع‌آوریِ کرایه در یک بازه: فاکتورهایی که دورهٔ اجاره‌شان با [from, to] همپوشانی
// دارد (periodStart <= to و periodEnd >= from) — نه فاکتورهایی که در این بازه صادر یا
// پرداخت شده‌اند؛ چون سؤالِ گزارش «برای این بازه چقدر باید می‌گرفتیم و چقدر گرفتیم» است.
export class RentCollectionQueryDto {
  @IsOptional()
  @IsUUID()
  marketId?: string;

  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  @IsOptional()
  @IsUUID()
  shopId?: string;
}
