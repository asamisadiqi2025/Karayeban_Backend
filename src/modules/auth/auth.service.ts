import { Injectable, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { RegisterSuperAdminDto } from './dto/register-super-admin.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async validateUser(identifier: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] },
    });
    if (!user) return null;
    // ✅ اصلاح: passwordHash
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return null;
    const { passwordHash, ...rest } = user;
    return rest;
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.identifier }, { username: dto.identifier }] },
    });
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

  async registerSuperAdmin(dto: RegisterSuperAdminDto) {
    const secret = this.config.get<string>('SUPER_ADMIN_REGISTRATION_SECRET');
    if (!secret || secret !== dto.secret) throw new UnauthorizedException('Invalid registration secret');

    const existing = await this.prisma.user.findFirst({ where: { isSuperAdmin: true } });
    if (existing) throw new BadRequestException('Super admin already exists');

    // Ensure base data exists (currency, market, roles)
    const afn = await this.prisma.currency.upsert({ where: { code: 'AFN' }, update: {}, create: { code: 'AFN', name: 'Afghani' } });

    const market = await this.prisma.market.upsert({
      where: { id: '11111111-1111-1111-1111-111111111111' },
      update: {},
      create: {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Central Market',
        address: 'Kabul, Afghanistan',
        baseCurrencyId: afn.id,
        isSetupComplete: true,
      },
    });

    await this.prisma.customRole.upsert({
      where: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
      update: {},
      create: {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        name: 'super_admin',
        marketId: market.id,
        permissions: ['*'],
        isSystem: true,
        description: 'Full system access',
      },
    });

    await this.prisma.customRole.upsert({
      where: { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' },
      update: {},
      create: {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        name: 'accountant',
        marketId: market.id,
        permissions: ['rent:collect', 'rent:read', 'expense:read', 'expense:write', 'report:read', 'report:export'],
        isSystem: true,
        description: 'Default accountant role',
      },
    });

    const hashed = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        passwordHash: hashed,
        fullName: dto.fullName || 'System Admin',
        isSuperAdmin: true,
        marketId: market.id,
        role: 'SUPER_ADMIN',
        isActive: true,
      },
      include: { market: true, customRole: true },
    });

    const { passwordHash, ...rest } = user as any;
    return rest;
  }
}
// ❌ خط تکراری را حذف کنید
// export class AuthService {}