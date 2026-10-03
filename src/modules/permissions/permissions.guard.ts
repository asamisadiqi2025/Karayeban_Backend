import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma/prisma.service';
import { PERMISSION_KEY } from '../../common/decorators/permission.decorator';
import { PermissionsService, readGrantedPermissions } from './permissions.service';

// گاردِ سراسری (بعد از JwtAuthGuard). فقط برای route هایی که @Permission دارند و فقط برای
// کاربرِ ACCOUNTANT/STAFF که ادمین برایش فهرستِ دسترسی ذخیره کرده، تصمیم می‌گیرد:
//  - کلید در فهرست بود: اجازه می‌دهد و RolesGuard را کنار می‌گذارد (req.permissionGranted).
//  - نبود: ۴۰۳.
// در همهٔ حالت‌های دیگر (ادمین/سوپرادمین، بدون فهرست، route بدون @Permission) هیچ کاری نمی‌کند
// و رفتارِ قبلیِ @Roles دست‌نخورده می‌ماند.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const req = context.switchToHttp().getRequest();
    const userId = req.user?.id;
    if (!userId) return true;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, grantedPermissions: true },
    });
    if (!user || user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return true;

    const granted = readGrantedPermissions(user.grantedPermissions);
    if (granted === null) return true;

    if (granted.includes(required)) {
      req.permissionGranted = true;
      return true;
    }
    throw new ForbiddenException(`شما دسترسی «${this.permissions.getLabel(required)}» را ندارید`);
  }
}
