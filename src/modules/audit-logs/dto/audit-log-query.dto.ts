import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { AuditAction } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

// عمداً بدون فیلد search عمومی: برای یک audit trail، فیلترِ دقیق (action/entityType/
// entityId/userId/بازه‌ی تاریخ) مهم‌تر از جست‌وجوی فازی است — کسی که دنبال یک رکورد
// حسابرسی می‌گردد معمولاً دقیقاً می‌داند چه چیزی می‌خواهد، نه یک عبارتِ آزاد.
export class AuditLogQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  // فقط SUPER_ADMIN می‌تواند این را استفاده کند تا بازارِ دیگری را ببیند؛ برای بقیه
  // نقش‌ها در سرویس نادیده گرفته و با بازارِ خودشان جایگزین می‌شود.
  @IsOptional()
  @IsUUID()
  marketId?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}
