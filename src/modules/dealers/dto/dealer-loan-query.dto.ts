import { Type } from 'class-transformer';
import { DealerLoanStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class DealerLoanQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  dealerId?: string;

  @IsOptional()
  @IsUUID()
  currencyId?: string;

  @IsOptional()
  @IsEnum(DealerLoanStatus)
  status?: DealerLoanStatus;

  // overdue = سررسید گذشته، due_soon = تا soonDays روزِ دیگر، ok = دورتر، no_due_date = بدونِ
  // سررسید. هرکدام فقط قرضِ بازِ برنگشته را می‌گیرد.
  @IsOptional()
  @IsIn(['overdue', 'due_soon', 'ok', 'no_due_date'])
  dueStatus?: 'overdue' | 'due_soon' | 'ok' | 'no_due_date';

  // «نزدیک به سررسید» یعنی چند روز؛ پیش‌فرض ۷.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  soonDays?: number;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dueFrom must be in YYYY-MM-DD format' })
  dueFrom?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dueTo must be in YYYY-MM-DD format' })
  dueTo?: string;

  // فقط برای SUPER_ADMIN.
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
