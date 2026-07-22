import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMarketDto {
  @ApiProperty({
    example: 'Karayeban-e-Markazi',
    description: 'Market name',
    minLength: 2,
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @Length(2, 255)
  name: string;

  @ApiProperty({
    example: 'MKT-001',
    description: 'Unique market code',
    minLength: 2,
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @Length(2, 50)
  code: string;

  @ApiPropertyOptional({
    example: 'Kabul, Afghanistan',
    description: 'Market address',
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    example: '+93700123456',
    description: 'Market phone number',
  })
  @IsOptional()
  @IsString()
  phone?: string;
}
