import { IsDateString, IsOptional, IsUUID } from 'class-validator';

// اگر asOfDate ارسال نشود، «همین الان» است — همان فیلد balance ازپیش‌محاسبه‌شدهٔ
// خودِ Account (بدون هیچ کوئری روی LedgerEntry). اگر ارسال شود، موجودی هر حساب تا
// پایانِ همان روز از روی LedgerEntry بازسازی می‌شود (مثل AccountsService.getStatement).
export class AccountBalancesQueryDto {
  @IsOptional()
  @IsUUID()
  marketId?: string;

  @IsOptional()
  @IsDateString()
  asOfDate?: string;
}
