import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CustomRoleQueryDto extends PaginationQueryDto {
  // فقط SUPER_ADMIN؛ برای ADMIN همیشه در سرویس override می‌شود.
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
