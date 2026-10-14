import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Gender } from '@prisma/client';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fatherName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  grandfatherName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  idNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contact?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsString()
  details?: string;

  @IsOptional()
  @IsString()
  photo?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
