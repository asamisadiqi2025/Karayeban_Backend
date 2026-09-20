import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { AccountTransactionType } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class AccountTransactionQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsEnum(AccountTransactionType)
  type?: AccountTransactionType;
}
