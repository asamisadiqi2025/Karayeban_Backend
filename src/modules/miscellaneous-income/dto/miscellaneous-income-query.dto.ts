import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class MiscellaneousIncomeQueryDto extends PaginationQueryDto {
  // اگر یک کتگوریِ مادر باشد، عایدی‌های همهٔ سب‌کتگوری‌هایش هم می‌آید.
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsUUID()
  currencyId?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  // فقط برای SUPER_ADMIN: محدودکردن به یک مارکت.
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
