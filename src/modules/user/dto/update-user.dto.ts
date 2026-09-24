import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from './create-user.dto';
import { PERMISSIONS, PermissionKey } from '../../../common/permissions/permissions.constant';

export class UpdateUserDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsString()
  @MinLength(8)
  @MaxLength(30)
  @Matches(/^[a-z0-9_.]+$/, {
    message:
      'username can only contain lowercase letters, numbers, "_" and "."',
  })
  @Matches(/(?=.*[a-z])(?=.*\d)/, {
    message: 'username must contain at least one letter and one number',
  })
  username?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  fatherName?: string;

  @IsOptional()
  @IsString()
  grandfatherName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  tazkiraNumber?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  profilePhoto?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  // null یعنی «نقش سفارشی را از این کاربر پس بگیر» — عمداً از string خالی جدا نگه
  // داشته شده تا با «چیزی نفرستاده‌شده» (undefined) اشتباه گرفته نشود.
  @IsOptional()
  @IsUUID()
  customRoleId?: string | null;

  @IsOptional()
  @IsUUID()
  marketId?: string;

  @IsOptional()
  isSuperAdmin?: boolean;

  // مثل CreateUserDto — یک permission خاص به همین یک کاربر بده/بگیر، جدا از
  // CustomRole اش. فرستادنِ آرایهٔ خالی یعنی «همه را پاک کن»، undefined یعنی «دست نزن».
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(PERMISSIONS, { each: true })
  extraPermissions?: PermissionKey[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(PERMISSIONS, { each: true })
  deniedPermissions?: PermissionKey[];
}
