import { IsOptional, IsUUID } from 'class-validator';

export class InventoryItemSummaryQueryDto {
  // فقط برای SUPER_ADMIN: محدود کردن مجموع ارزش انبار به یک بازار مشخص؛ اگر ارسال نشود،
  // SUPER_ADMIN مجموع همهٔ بازارها را می‌بیند. برای نقش‌های دیگر نادیده گرفته می‌شود.
  @IsOptional()
  @IsUUID()
  marketId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}
