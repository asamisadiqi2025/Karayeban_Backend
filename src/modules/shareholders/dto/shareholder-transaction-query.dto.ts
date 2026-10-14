import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ShareholderTransactionType } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ShareholderTransactionQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  shareholderId?: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsEnum(ShareholderTransactionType)
  type?: ShareholderTransactionType;
}
