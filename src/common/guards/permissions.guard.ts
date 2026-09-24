import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma/prisma.service';
import { PermissionKey } from '../permissions/permissions.constant';
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

// این guard فقط برای STAFF فعال می‌شود؛ SUPER_ADMIN/ADMIN/ACCOUNTANT همیشه رد می‌شوند —
// دسترسیِ آن‌ها از قبل با @Roles() تعیین شده و این لایه نباید چیزی از آن‌ها بگیرد.
// اگر روی یک endpoint اصلاً @RequirePermissions نباشد، این guard کاری نمی‌کند (باز است) —
// یعنی وجودش به‌تنهایی هیچ endpoint موجودی را محدودتر نمی‌کند، فقط جایی که صریحاً
// خواسته شود.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.get<PermissionKey[]>(REQUIRE_PERMISSIONS_KEY, context.getHandler()) ??
      this.reflector.get<PermissionKey[]>(REQUIRE_PERMISSIONS_KEY, context.getClass());

    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const currentUser = req.user;
    if (!currentUser) throw new ForbiddenException('No user');

    if (currentUser.role !== 'STAFF') return true;

    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: {
        customRole: { select: { permissions: true } },
        extraPermissions: true,
        deniedPermissions: true,
      },
    });
    if (!user) throw new ForbiddenException('کاربر معتبر نیست');

    const base = new Set<string>(user.customRole?.permissions ?? []);
    for (const p of asStringArray(user.extraPermissions)) base.add(p);
    for (const p of asStringArray(user.deniedPermissions)) base.delete(p);

    const missing = required.filter((p) => !base.has(p));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `این کاربر دسترسیِ زیر را ندارد: ${missing.join(', ')}`,
      );
    }

    return true;
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}
