import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ExpenseCategoryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isActive?: boolean;

  // برای گرفتنِ فقط سب‌کتگوری‌های یک کتگوریِ مادرِ مشخص (مثلاً برای cascading dropdown).
  // نفرستید = همه (مادر و فرزند با هم)؛ 'root' بفرستید = فقط کتگوری‌های مادر.
  @IsOptional()
  parentId?: string;
}
