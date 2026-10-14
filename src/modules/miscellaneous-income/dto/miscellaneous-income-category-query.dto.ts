import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class MiscellaneousIncomeCategoryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isActive?: boolean;

  // برای گرفتنِ فقط سب‌کتگوری‌های یک کتگوریِ مادرِ مشخص (cascading dropdown / typeahead).
  // نفرستید = همه (مادر و فرزند با هم)؛ 'root' بفرستید = فقط کتگوری‌های مادر. برای مارکت‌های با
  // سب‌کتگوریِ زیاد، فرانت باید اول root را بگیرد و زیرشاخه‌ها را با parentId + search + صفحه‌بندی.
  @IsOptional()
  @ValidateIf((o: MiscellaneousIncomeCategoryQueryDto) => o.parentId !== 'root')
  @IsUUID()
  parentId?: string;

  // فقط برای SUPER_ADMIN: محدودکردن به یک مارکت (بدونِ آن، دسته‌بندیِ همهٔ مارکت‌ها می‌آید).
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
