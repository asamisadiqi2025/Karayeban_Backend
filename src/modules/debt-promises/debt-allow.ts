import { readGrantedPermissions } from '../permissions/permissions.service';

// کلیدِ «اجازهٔ فسخ/تمدید با بدهیِ باقی‌مانده». ادمین و سوپرادمین همیشه دارند؛ ادمین می‌تواند آن را
// (مثل هر دسترسیِ دیگر در permissions.catalog.ts) برای حسابدار/کارمند هم فعال کند.
export const ALLOW_DEBT_PERMISSION = 'contracts.allow_debt';

const FULL_ACCESS_ROLES = ['SUPER_ADMIN', 'ADMIN'];

export function canAllowDebt(user: { role: string; grantedPermissions?: unknown }): boolean {
  if (FULL_ACCESS_ROLES.includes(user.role)) return true;
  const granted = readGrantedPermissions(user.grantedPermissions);
  return granted !== null && granted.includes(ALLOW_DEBT_PERMISSION);
}
