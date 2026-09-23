import { IsDateString, IsOptional, IsUUID } from 'class-validator';

// عملکردِ جمع‌آوریِ بلِ برق در یک بازه — همان منطقِ RentCollectionQueryDto، فقط روی
// ElectricityBill: بل‌هایی که دورهٔ میترخوانی‌شان با [from, to] همپوشانی دارد.
export class ElectricityCollectionQueryDto {
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
