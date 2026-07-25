import { IsEnum, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MarketStatus } from '../../generated/prisma/enums';

export class CreateMarketDto {
  @ApiProperty({
    example: 'Karayeban-e-Markazi',
    description: 'Market name',
    minLength: 2,
    maxLength: 255,
  })
  @IsString({ message: 'نام بايد رشته باشد.' })
  @IsNotEmpty({ message: 'نام الزامي است.' })
  @Length(2, 255, { message: 'نام بايد بين ۲ تا ۲۵۵ کاراکتر باشد.' })
  name: string;

  @ApiProperty({
    example: 'MKT-001',
    description: 'Unique market code',
    minLength: 2,
    maxLength: 50,
  })
  @IsString({ message: 'کد بايد رشته باشد.' })
  @IsNotEmpty({ message: 'کد الزامي است.' })
  @Length(2, 50, { message: 'کد بايد بين ۲ تا ۵۰ کاراکتر باشد.' })
  code: string;

  @ApiPropertyOptional({
    example: 'Kabul, Afghanistan',
    description: 'Market address',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'آدرس بايد رشته باشد.' })
  @Length(0, 500, { message: 'آدرس نبايد بيش از ۵۰۰ کاراکتر باشد.' })
  address?: string;

  @ApiPropertyOptional({
    example: '+93700123456',
    description: 'Market phone number',
    maxLength: 20,
  })
  @IsOptional()
  @IsString({ message: 'شماره تلفن بايد رشته باشد.' })
  @Length(0, 20, { message: 'شماره تلفن نبايد بيش از ۲۰ کاراکتر باشد.' })
  phone?: string;

  @ApiPropertyOptional({
    enum: MarketStatus,
    description: 'Market status',
    default: MarketStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(MarketStatus, { message: 'وضعيت نامعتبر است.' })
  status?: MarketStatus;
}
