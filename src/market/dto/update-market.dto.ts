import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MarketStatus } from '../../generated/prisma/enums';

export class UpdateMarketDto {
  @ApiPropertyOptional({ example: 'Karayeban-e-Markazi', minLength: 2, maxLength: 255 })
  @IsOptional()
  @IsString({ message: 'نام بايد رشته باشد.' })
  @Length(2, 255, { message: 'نام بايد بين ۲ تا ۲۵۵ کاراکتر باشد.' })
  name?: string;

  @ApiPropertyOptional({ example: 'MKT-001', minLength: 2, maxLength: 50 })
  @IsOptional()
  @IsString({ message: 'کد بايد رشته باشد.' })
  @Length(2, 50, { message: 'کد بايد بين ۲ تا ۵۰ کاراکتر باشد.' })
  code?: string;

  @ApiPropertyOptional({ example: 'Kabul, Afghanistan', maxLength: 500 })
  @IsOptional()
  @IsString({ message: 'آدرس بايد رشته باشد.' })
  @Length(0, 500, { message: 'آدرس نبايد بيش از ۵۰۰ کاراکتر باشد.' })
  address?: string;

  @ApiPropertyOptional({ example: '+93700123456', maxLength: 20 })
  @IsOptional()
  @IsString({ message: 'شماره تلفن بايد رشته باشد.' })
  @Length(0, 20, { message: 'شماره تلفن نبايد بيش از ۲۰ کاراکتر باشد.' })
  phone?: string;

  @ApiPropertyOptional({ enum: MarketStatus })
  @IsOptional()
  @IsEnum(MarketStatus, { message: 'وضعيت نامعتبر است.' })
  status?: MarketStatus;
}
