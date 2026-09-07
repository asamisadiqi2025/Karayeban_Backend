import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Gender } from '@prisma/client';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fullName: string;

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

  // فقط برای SUPER_ADMIN: ساخت مستأجر زیر یک بازار مشخص. برای نقش‌های دیگر نادیده گرفته
  // می‌شود و بازار از روی کاربر جاری تعیین می‌گردد.
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
