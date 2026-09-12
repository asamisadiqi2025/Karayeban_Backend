import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { CreateOpeningStockDto } from './create-opening-stock.dto';

export class CreateInventoryItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  unit: string;

  @IsUUID()
  warehouseId: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsUUID()
  currencyId: string;

  @IsOptional()
  @IsString()
  details?: string;

  // اگر کالا از قبل به تعداد/ارزش مشخصی موجود است (نه یک خرید تازه از بانک)، همین‌جا
  // ثبت می‌شود — quantity/averageCost کالا مستقیم از این مقدار پر می‌شوند و یک رویداد
  // ADJUSTMENT برای تاریخچه ساخته می‌شود. اگر خالی بماند، کالا با موجودی صفر ساخته
  // می‌شود و باید بعداً با یک تراکنش PURCHASE/ADJUSTMENT پر شود.
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateOpeningStockDto)
  openingStock?: CreateOpeningStockDto;

  // فقط برای SUPER_ADMIN: ثبت کالا زیر یک بازار مشخص. برای نقش‌های دیگر نادیده گرفته
  // می‌شود و بازار از روی کاربر جاری تعیین می‌گردد.
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
