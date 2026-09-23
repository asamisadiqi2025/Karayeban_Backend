import { IsOptional, IsUUID } from 'class-validator';

// اسنپ‌شاتِ همین‌الانِ سهمِ همهٔ سهام‌داران یک بازار + مجموعِ واریز/برداشتِ هرکدام —
// درصدِ سهم یک تاریخچه است (ShareholderEquity)، پس همیشه آخرین ردیفِ هر سهام‌دار مبنا
// قرار می‌گیرد؛ تاریخ ورودی لازم نیست.
export class ShareholderEquitySummaryQueryDto {
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
