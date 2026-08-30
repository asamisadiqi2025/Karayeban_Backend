import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateFloorDto {
  @IsInt()
  floorNumber: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  details?: string;

  // فقط برای SUPER_ADMIN: ساخت طبقه زیر یک بازار مشخص. برای نقش‌های دیگر نادیده گرفته می‌شود
  // و بازار از روی کاربر جاری تعیین می‌گردد.
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
