import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AuthUser } from '../types/jwt-payload.type';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user: AuthUser }>();

    // اینجا «همه» مجوزهای لازم باید موجود باشد (AND). اگر OR می‌خواهی some بگذار
    const hasAll = requiredPermissions.every((p) =>
      user?.permissions?.includes(p),
    );
    if (!hasAll) {
      throw new ForbiddenException('مجوز لازم برای این عملیات را ندارید');
    }
    return true;
  }
}