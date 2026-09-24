import { ArrayUnique, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PERMISSIONS, PermissionKey } from '../../../common/permissions/permissions.constant';

export class UpdateCustomRoleDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(PERMISSIONS, { each: true })
  permissions?: PermissionKey[];

  @IsOptional()
  @IsString()
  description?: string;
}
