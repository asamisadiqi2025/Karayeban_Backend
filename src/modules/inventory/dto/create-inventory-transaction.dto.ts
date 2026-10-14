import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { InventoryTransactionType } from '@prisma/client';

const MONEY_TYPES: InventoryTransactionType[] = [
  InventoryTransactionType.PURCHASE,
  InventoryTransactionType.SALE,
];

export class CreateInventoryTransactionDto {
  @IsUUID()
  itemId: string;

  @IsEnum(InventoryTransactionType)
  type: InventoryTransactionType;

  // برای PURCHASE/SALE/CONSUMPTION همیشه مثبت؛ فقط ADJUSTMENT می‌تواند منفی باشد
  // (اصلاح کاهشی موجودی) — همین‌جا مثبت/منفی بودن چک نمی‌شود، در سرویس بسته به type بررسی می‌شود.
  @IsNumber()
  quantity: number;

  // فقط PURCHASE/SALE — قیمت واحد که مبلغ کل و (برای SALE) بهای تمام‌شدهٔ فروش از آن حساب می‌شود.
  @ValidateIf((dto: CreateInventoryTransactionDto) =>
    MONEY_TYPES.includes(dto.type),
  )
  @IsNumber()
  @IsPositive()
  unitPrice?: number;

  // فقط PURCHASE/SALE — حسابی که پول از/به آن جابه‌جا می‌شود.
  @ValidateIf((dto: CreateInventoryTransactionDto) =>
    MONEY_TYPES.includes(dto.type),
  )
  @IsUUID()
  accountId?: string;

  // فقط PURCHASE/SALE — نرخِ دستیِ همین تراکنش (۱ واحد ارز کالا = X واحد ارز پایه). اگر
  // نیاید، آخرین نرخ ثبت‌شدهٔ مارکت استفاده می‌شود. نرخ سیستم هرگز با این تغییر نمی‌کند.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  exchangeRate?: number;

  @IsOptional()
  @IsDateString()
  transactionDate?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  notes?: string;
}
