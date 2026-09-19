import { IsDateString, IsOptional, IsUUID, ValidateIf } from 'class-validator';

// گزارش دوره‌ای موجودی (مثل صورت‌حساب بانکی): موجودی اول دوره + جمع خرید/فروش/مصرف/اصلاح
// همان بازه + موجودی آخر دوره. دقیقاً یکی از itemId یا warehouseId باید داده شود —
// itemId برای یک کالای مشخص، warehouseId برای همهٔ کالاهای فعالِ آن گدام یک‌جا.
export class StockStatementQueryDto {
  @ValidateIf((dto: StockStatementQueryDto) => !dto.warehouseId)
  @IsUUID()
  itemId?: string;

  @ValidateIf((dto: StockStatementQueryDto) => !dto.itemId)
  @IsUUID()
  warehouseId?: string;

  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}
