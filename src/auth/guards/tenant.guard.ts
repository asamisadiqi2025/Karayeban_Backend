import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../types/jwt-payload.type';
import type { Request } from 'express';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user: AuthUser }>();
    const user = request.user;

    if (!user.marketId) {
      return true;
    }

    const requestMarketId =
      request.query?.marketId || request.body?.marketId || request.headers?.['x-tenant-id'];

    if (requestMarketId && requestMarketId !== user.marketId) {
      throw new ForbiddenException('You do not have access to this market');
    }

    return true;
  }
}
