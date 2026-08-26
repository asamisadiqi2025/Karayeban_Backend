import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { AccountType } from '@prisma/client';
import { CreateOpeningBalanceDto } from './opening-balance.dto';

export class CreateAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsEnum(AccountType)
  type: AccountType;

  @IsUUID()
  currencyId: string;

  // برای حساب بانکی نام بانک الزامی است؛ برای دخل (CASH) لازم نیست.
  @ValidateIf((dto: CreateAccountDto) => dto.type === AccountType.BANK)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  accountNumber?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateOpeningBalanceDto)
  openingBalance?: CreateOpeningBalanceDto;

   
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
