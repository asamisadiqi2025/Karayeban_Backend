import { IsDateString, IsOptional, IsUUID } from 'class-validator';

// خلاصهٔ حرکتِ انبار در سطحِ کلِ بازار برای یک بازه — برخلافِ StockStatementQueryDto که
// همیشه یا یک جنس یا یک گدام می‌خواهد، این یک عددِ کلی می‌دهد: جمعِ خرید/فروش/مصرف/
// اصلاح/انتقال، مستقل از اینکه کدام جنس یا کدام گدام. warehouseId اختیاری است تا در
// صورتِ نیاز فقط همان یک گدام محدود شود.
export class InventoryMovementSummaryQueryDto {
  @IsOptional()
  @IsUUID()
  marketId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}
