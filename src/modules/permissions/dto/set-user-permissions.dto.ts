import { ArrayUnique, IsArray, IsIn, IsString } from 'class-validator';
import { ALL_PERMISSION_KEYS } from '../permissions.catalog';

export class SetUserPermissionsDto {
  // فهرستِ کاملِ کارهایی که تیک خورده‌اند؛ هر چه نیامده باشد گرفته می‌شود.
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsIn(ALL_PERMISSION_KEYS, { each: true })
  permissions: string[];
}
