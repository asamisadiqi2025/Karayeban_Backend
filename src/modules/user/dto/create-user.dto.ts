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
import { PERMISSIONS, PermissionKey } from '../../../common/permissions/permissions.constant';

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  ACCOUNTANT = 'ACCOUNTANT',
  STAFF = 'STAFF',
}

export class CreateUserDto {
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
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'password must contain at least one letter and one number',
  })
  password: string;

  @IsString()
  fullName: string;

  @IsOptional()
  @IsString()
  fatherName?: string;

  @IsOptional()
  @IsString()
  grandfatherName?: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  tazkiraNumber?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  profilePhoto?: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsUUID()
  customRoleId?: string;

  @IsOptional()
  @IsUUID()
  marketId?: string;

  @IsOptional()
  isSuperAdmin?: boolean;

  // این دو فیلد فقط برای STAFF معنا دارند (PermissionsGuard فقط برای همان نقش چک
  // می‌کند) — امکانِ دادن/گرفتنِ یک permission خاص به همین یک کاربر، جدا از
  // CustomRole اش. مثال: کاربر CustomRole «حسابدار» دارد ولی می‌خواهی فقط همین یکی
  // اضافه‌تر بتواند انتقال حساب هم بزند → آن یکی permission را در extraPermissions بگذار.
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
