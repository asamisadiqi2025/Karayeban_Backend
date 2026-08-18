import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class RefreshTokenGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const token = req.body?.refreshToken;
    if (!token) throw new UnauthorizedException('Refresh token missing');

    const rt = await this.prisma.refreshToken.findUnique({ where: { token } });
    if (!rt) throw new UnauthorizedException('Invalid refresh token');
    if (rt.revoked) throw new UnauthorizedException('Refresh token revoked');
    if (rt.expiresAt < new Date()) throw new UnauthorizedException('Refresh token expired');

    const user = await this.prisma.user.findUnique({ where: { id: rt.userId } });
    if (!user) throw new UnauthorizedException('User not found');

    req.user = { id: user.id, email: user.email, role: user.role };
    return true;
  }
}
