import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  BadRequestException,
} from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../common/audit-log/audit-log.service';
import { RequestMeta } from '../../common/audit-log/request-meta.util';
import { PERMISSION_KEY } from '../../common/decorators/permission.decorator';
import { ALL_PERMISSION_KEYS, PERMISSION_CATALOG } from './permissions.catalog';

const ALL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'STAFF'];
const FULL_ACCESS_ROLES = ['SUPER_ADMIN', 'ADMIN'];
const CONFIGURABLE_ROLES = ['ACCOUNTANT', 'STAFF'];

type Actor = { id: string; role: string; marketId: string | null };

export function readGrantedPermissions(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((v): v is string => typeof v === 'string');
}

@Injectable()
export class PermissionsService implements OnModuleInit {
  private readonly logger = new Logger(PermissionsService.name);
  private readonly rolesByPermission = new Map<string, Set<string>>();
  private readonly labelByKey = new Map<string, string>(
    PERMISSION_CATALOG.flatMap((s) => s.items.map((i) => [i.key, i.label] as [string, string])),
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  // نقش‌های پیش‌فرضِ هر دسترسی از روی @Roles همان route‌هایی که آن کلید را دارند به‌دست می‌آید
  // (اشتراکِ نقش‌های مجازِ همهٔ آن route‌ها) — پس تیک‌های پیش‌فرض هیچ‌وقت بیشتر از رفتار فعلی نمی‌دهند.
  onModuleInit() {
    const known = new Set(ALL_PERMISSION_KEYS);
    for (const wrapper of this.discovery.getControllers()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;
      const proto = Object.getPrototypeOf(instance);
      for (const name of this.scanner.getAllMethodNames(proto)) {
        const handler = proto[name];
        const key = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [handler, metatype]);
        if (!key) continue;
        if (!known.has(key)) {
          throw new Error(`Permission «${key}» (on ${metatype.name}.${name}) is not defined in permissions.catalog.ts`);
        }
        const routeRoles = this.reflector.getAllAndOverride<string[] | undefined>('roles', [handler, metatype]);
        const allowed = new Set(routeRoles && routeRoles.length > 0 ? routeRoles : ALL_ROLES);
        const current = this.rolesByPermission.get(key);
        if (!current) {
          this.rolesByPermission.set(key, allowed);
        } else {
          for (const r of [...current]) if (!allowed.has(r)) current.delete(r);
        }
      }
    }
    const unused = ALL_PERMISSION_KEYS.filter((k) => !this.rolesByPermission.has(k));
    if (unused.length > 0) {
      this.logger.warn(`Permissions defined in catalog but not used on any route: ${unused.join(', ')}`);
    }
  }

  getLabel(key: string): string {
    return this.labelByKey.get(key) ?? key;
  }

  getCatalog() {
    return PERMISSION_CATALOG;
  }

  private defaultAllows(role: string, key: string): boolean {
    if (FULL_ACCESS_ROLES.includes(role)) return true;
    return this.rolesByPermission.get(key)?.has(role) ?? false;
  }

  // فهرستِ کلیدهایی که این کاربر «در عمل» دارد: ادمین‌ها همه؛ اگر ادمین هنوز چیزی ذخیره
  // نکرده باشد پیش‌فرضِ نقش؛ وگرنه دقیقاً همان فهرستِ ذخیره‌شده.
  effectiveKeys(role: string, granted: string[] | null): string[] {
    if (FULL_ACCESS_ROLES.includes(role)) return ALL_PERMISSION_KEYS;
    if (granted) return granted.filter((k) => this.labelByKey.has(k));
    return ALL_PERMISSION_KEYS.filter((k) => this.defaultAllows(role, k));
  }

  private async getActor(currentUser: { id: string }): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, role: true, marketId: true },
    });
    if (!user) throw new ForbiddenException('کاربر معتبر نیست');
    return user;
  }

  private async loadTarget(actor: Actor, id: string) {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, fullName: true, role: true, marketId: true, grantedPermissions: true },
    });
    if (!target) throw new NotFoundException('کاربر یافت نشد');
    if (actor.role !== 'SUPER_ADMIN' && (!actor.marketId || target.marketId !== actor.marketId)) {
      throw new ForbiddenException('دسترسی به این کاربر مجاز نیست');
    }
    return target;
  }

  private buildView(target: { id: string; role: string; fullName: string; grantedPermissions: unknown }) {
    const granted = readGrantedPermissions(target.grantedPermissions);
    const effective = new Set(this.effectiveKeys(target.role, granted));
    return {
      userId: target.id,
      fullName: target.fullName,
      role: target.role,
      editable: CONFIGURABLE_ROLES.includes(target.role),
      mode: FULL_ACCESS_ROLES.includes(target.role) ? 'full-access' : granted ? 'custom' : 'role-default',
      sections: PERMISSION_CATALOG.map((section) => ({
        key: section.key,
        label: section.label,
        items: section.items.map((item) => ({
          key: item.key,
          label: item.label,
          granted: effective.has(item.key),
        })),
      })),
    };
  }

  async getForUser(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const target = await this.loadTarget(actor, id);
    return this.buildView(target);
  }

  async getMine(currentUser: { id: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { role: true, grantedPermissions: true },
    });
    if (!user) throw new ForbiddenException('کاربر معتبر نیست');
    return { role: user.role, permissions: this.effectiveKeys(user.role, readGrantedPermissions(user.grantedPermissions)) };
  }

  async setForUser(currentUser: { id: string }, id: string, permissions: string[], meta: RequestMeta) {
    const actor = await this.getActor(currentUser);
    const target = await this.loadTarget(actor, id);
    if (!CONFIGURABLE_ROLES.includes(target.role)) {
      throw new BadRequestException('دسترسیِ ادمین و سوپرادمین قابل تنظیم نیست (همیشه کامل است)');
    }
    const next = [...new Set(permissions)];
    return this.save(actor, target, next, meta);
  }

  async resetForUser(currentUser: { id: string }, id: string, meta: RequestMeta) {
    const actor = await this.getActor(currentUser);
    const target = await this.loadTarget(actor, id);
    if (!CONFIGURABLE_ROLES.includes(target.role)) {
      throw new BadRequestException('دسترسیِ ادمین و سوپرادمین قابل تنظیم نیست (همیشه کامل است)');
    }
    return this.save(actor, target, null, meta);
  }

  private async save(
    actor: Actor,
    target: { id: string; role: string; fullName: string; marketId: string | null; grantedPermissions: unknown },
    next: string[] | null,
    meta: RequestMeta,
  ) {
    const updated = await this.prisma.user.update({
      where: { id: target.id },
      data: { grantedPermissions: next === null ? Prisma.DbNull : next },
      select: { id: true, fullName: true, role: true, marketId: true, grantedPermissions: true },
    });

    await this.auditLog.record({
      action: 'UPDATE',
      entityType: 'UserPermissions',
      entityId: target.id,
      marketId: target.marketId,
      userId: actor.id,
      oldData: { grantedPermissions: readGrantedPermissions(target.grantedPermissions) },
      newData: { grantedPermissions: next },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return this.buildView(updated);
  }
}
