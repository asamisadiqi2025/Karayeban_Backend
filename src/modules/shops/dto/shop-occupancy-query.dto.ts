import { IsOptional, IsUUID } from 'class-validator';

// اسنپ‌شاتِ همین‌الانِ اشغال/خالی‌بودنِ دوکان‌ها — status روی خودِ Shop همیشه به‌روز است
// (هر جا قرارداد ساخته/شروع/فسخ می‌شود همان‌جا نوشته می‌شود)، پس تاریخ لازم نیست.
export class ShopOccupancyQueryDto {
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
