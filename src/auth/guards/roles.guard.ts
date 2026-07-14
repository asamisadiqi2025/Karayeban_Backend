import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthUser } from '../types/jwt-payload.type';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // اگر route نقش خاصی نخواسته، آزاد است
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user: AuthUser }>();

    // کافی است کاربر یکی از نقش‌های لازم را داشته باشد
    const hasRole = requiredRoles.some((role) => user?.roles?.includes(role));
    if (!hasRole) {
      throw new ForbiddenException('شما به این بخش دسترسی ندارید');
    }
    return true;
  }
}