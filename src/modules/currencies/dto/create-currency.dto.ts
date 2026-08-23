import { IsString, Matches } from 'class-validator';

export class CreateCurrencyDto {
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'code must be a 3-letter ISO 4217 currency code' })
  code: string;
}
