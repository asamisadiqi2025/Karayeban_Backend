import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    // ✅ اصلاح: passwordHash
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return null;
    const { passwordHash, ...rest } = user;
    return rest;
  }

  async login(dto: { email: string; password: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    // ✅ اصلاح: passwordHash
    const match = await bcrypt.compare(dto.password, user.passwordHash);
    if (!match) throw new UnauthorizedException('Invalid credentials');

    const payload = { sub: user.id, id: user.id, email: user.email, role: user.role };
    const accessToken = this.jwt.sign(payload);

    const refreshToken = randomBytes(40).toString('hex');
    const refreshExpiresIn = parseInt(this.config.get<string>('JWT_REFRESH_EXPIRES_IN') || '604800');
    const expiresAt = new Date(Date.now() + refreshExpiresIn * 1000);

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
        revoked: false,
      },
    });

    return { accessToken, refreshToken, expiresIn: this.config.get<string>('JWT_EXPIRES_IN') };
  }

  async refresh(token: string, userId: string) {
    const rt = await this.prisma.refreshToken.findUnique({ where: { token } });
    if (!rt) throw new NotFoundException('Refresh token not found');
    if (rt.revoked) throw new UnauthorizedException('Refresh token revoked');
    if (rt.expiresAt < new Date()) throw new UnauthorizedException('Refresh token expired');

    const user = await this.prisma.user.findUnique({ where: { id: rt.userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.refreshToken.update({ where: { id: rt.id }, data: { revoked: true } });

    const payload = { sub: user.id, id: user.id, email: user.email, role: user.role };
    const accessToken = this.jwt.sign(payload);

    const refreshToken = randomBytes(40).toString('hex');
    const refreshExpiresIn = parseInt(this.config.get<string>('JWT_REFRESH_EXPIRES_IN') || '604800');
    const expiresAt = new Date(Date.now() + refreshExpiresIn * 1000);

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
        revoked: false,
      },
    });

    return { accessToken, refreshToken, expiresIn: this.config.get<string>('JWT_EXPIRES_IN') };
  }

  async logout(token: string) {
    const rt = await this.prisma.refreshToken.findUnique({ where: { token } });
    if (!rt) throw new NotFoundException('Refresh token not found');
    await this.prisma.refreshToken.update({ where: { id: rt.id }, data: { revoked: true } });
    return { success: true };
  }
}
// ❌ خط تکراری را حذف کنید
// export class AuthService {}