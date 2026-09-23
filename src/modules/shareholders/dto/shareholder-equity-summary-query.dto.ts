import { IsDateString, IsOptional, IsUUID } from 'class-validator';

// currentPercentage/isBalanced همیشه اسنپ‌شاتِ همین‌الان‌اند (آخرین ردیفِ ShareholderEquity)
// و تاریخ رویشان اثر ندارد. اما واریز/برداشت رویدادِ واقعی با تاریخ‌اند — اگر fromDate/toDate
// داده شود، فقط جمع‌بندیِ آن‌ها (byCurrency, grandTotalsByCurrency) به همان بازه محدود
// می‌شود؛ بدون آن‌ها، مثل قبل all-time می‌ماند.
export class ShareholderEquitySummaryQueryDto {
  @IsOptional()
  @IsUUID()
  marketId?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}
