import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { DealerType } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const toBool = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class DealerQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(DealerType)
  type?: DealerType;

  // true = فقط دیلرهایی که الان قرضِ بازِ برنگشته دارند؛ false = فقط بدونِ قرضِ باز.
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  hasDebt?: boolean;

  // فقط برای SUPER_ADMIN.
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
