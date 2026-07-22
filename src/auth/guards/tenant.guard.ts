import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthUser } from '../types/jwt-payload.type';
import type { Request } from 'express';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user: AuthUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (!user.marketId) {
      return true;
    }

    const requestMarketId =
      (request.query?.marketId as string | undefined) ??
      (request.body?.marketId as string | undefined) ??
      (request.headers?.['x-tenant-id'] as string | undefined);

    if (requestMarketId && requestMarketId !== user.marketId) {
      throw new ForbiddenException('You do not have access to this market');
    }

    return true;
  }
}
