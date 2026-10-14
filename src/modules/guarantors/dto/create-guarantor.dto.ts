import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateGuarantorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  idNumber?: string;

  @IsOptional()
  @IsString()
  details?: string;

  // فقط برای SUPER_ADMIN: ساخت ضامن زیر یک بازار مشخص. برای نقش‌های دیگر نادیده گرفته می‌شود
  // و بازار از روی کاربر جاری تعیین می‌گردد.
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
