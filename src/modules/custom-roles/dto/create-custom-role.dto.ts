import { ArrayUnique, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PERMISSIONS, PermissionKey } from '../../../common/permissions/permissions.constant';

export class CreateCustomRoleDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsArray()
  @ArrayUnique()
  @IsIn(PERMISSIONS, { each: true })
  permissions: PermissionKey[];

  @IsOptional()
  @IsString()
  description?: string;

  // فقط SUPER_ADMIN استفاده می‌کند (برای ساختن نقش برای بازاری غیر از بازار خودش).
  // ADMIN همیشه در سرویس override می‌شود، حتی اگر این را بفرستد.
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
