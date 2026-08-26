import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class TransferFundsDto {
  @IsUUID()
  fromAccountId: string;

  @IsUUID()
  toAccountId: string;

  // مبلغ کسرشده از حساب مبدا، به ارز خودِ حساب مبدا.
  @IsNumber()
  @IsPositive()
  amount: number;

  // فقط وقتی حساب مبدا و مقصد ارز متفاوت دارند الزامی است — «۱ واحد ارز مبدا = exchangeRate واحد ارز مقصد».
  @IsOptional()
  @IsNumber()
  @IsPositive()
  exchangeRate?: number;

  @IsOptional()
  @IsDateString()
  transferDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
