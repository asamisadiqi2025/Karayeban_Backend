import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class TransferQueryDto extends PaginationQueryDto {
  // اگر ست شود، انتقالاتی که این حساب چه مبدا چه مقصدش بوده برمی‌گرداند.
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsUUID()
  fromAccountId?: string;

  @IsOptional()
  @IsUUID()
  toAccountId?: string;
}
