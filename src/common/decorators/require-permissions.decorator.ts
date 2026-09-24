import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from '../permissions/permissions.constant';

export const REQUIRE_PERMISSIONS_KEY = 'requiredPermissions';

// جدا از @Roles(): این فقط یک لایهٔ اضافه‌ی برای STAFF است، نه جایگزینِ نقش. یک
// endpoint باید هم 'STAFF' را در @Roles() داشته باشد هم @RequirePermissions را، وگرنه
// RolesGuard اصلاً اجازهٔ رسیدنِ STAFF به این‌جا را نمی‌دهد که نوبت به PermissionsGuard برسد.
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);
