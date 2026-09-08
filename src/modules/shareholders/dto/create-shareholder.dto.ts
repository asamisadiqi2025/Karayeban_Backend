import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateShareholderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fullName: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  idNumber?: string;

  // فقط برای SUPER_ADMIN: ساخت سهام‌دار زیر یک بازار مشخص.
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
