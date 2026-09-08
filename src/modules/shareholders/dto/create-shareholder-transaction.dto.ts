import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ShareholderTransactionType } from '@prisma/client';

export class CreateShareholderTransactionDto {
  @IsEnum(ShareholderTransactionType)
  type: ShareholderTransactionType;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsUUID()
  accountId: string;

  @IsOptional()
  @IsDateString()
  transactionDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  receiptNumber?: string;

  @IsOptional()
  @IsString()
  details?: string;
}
