import { Injectable, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { RegisterSuperAdminDto } from './dto/register-super-admin.dto';
import { LoginDto } from './dto/login.dto';
import { AuditLogService } from '../../common/audit-log/audit-log.service';
import { RequestMeta } from '../../common/audit-log/request-meta.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly auditLog: AuditLogService,
  ) {}

  async validateUser(identifier: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] },
    });
    if (!user) return null;
     const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return null;
    const { passwordHash, ...rest } = user;
    return rest;
  }

  async login(dto: LoginDto, meta: RequestMeta) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.identifier }, { username: dto.identifier }] },
    });
    if (!user) {
      // identifier نادرست است — کاربری برای گره‌زدنِ entityId وجود ندارد، ولی خودِ
      // تلاشِ لاگینِ ناموفق (با آی‌پی/زمان) برای تشخیصِ حملهٔ brute-force ثبت می‌شود.
      await this.auditLog.record({
        action: 'LOGIN_FAILED',
        entityType: 'User',
        newData: { identifier: dto.identifier, reason: 'user_not_found' },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const match = await bcrypt.compare(dto.password, user.passwordHash);
    if (!match) {
      await this.auditLog.record({
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        marketId: user.marketId,
        userId: user.id,
        newData: { identifier: dto.identifier, reason: 'wrong_password' },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

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

    await this.auditLog.record({
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      marketId: user.marketId,
      userId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const { passwordHash, ...userWithoutPassword } = user;

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN'),
      user: userWithoutPassword,
    };
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

  async logout(token: string, meta: RequestMeta) {
    const rt = await this.prisma.refreshToken.findUnique({ where: { token } });
    if (!rt) throw new NotFoundException('Refresh token not found');
    await this.prisma.refreshToken.update({ where: { id: rt.id }, data: { revoked: true } });

    const user = await this.prisma.user.findUnique({ where: { id: rt.userId } });
    await this.auditLog.record({
      action: 'LOGOUT',
      entityType: 'User',
      entityId: rt.userId,
      marketId: user?.marketId,
      userId: rt.userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return { success: true };
  }

  async registerSuperAdmin(dto: RegisterSuperAdminDto, meta: RequestMeta) {
    const secret = this.config.get<string>('SUPER_ADMIN_REGISTRATION_SECRET');
    if (!secret || secret !== dto.secret) throw new UnauthorizedException('Invalid registration secret');

    const existing = await this.prisma.user.findFirst({ where: { isSuperAdmin: true } });
    if (existing) throw new BadRequestException('Super admin already exists');

    const hashed = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        passwordHash: hashed,
        fullName: dto.fullName || 'System Admin',
        isSuperAdmin: true,
        role: 'SUPER_ADMIN',
        isActive: true,
      },
    });

    const { passwordHash, ...rest } = user as any;

    // حساس‌ترین عملیاتِ ممکن در کل سیستم — ساختِ اولین سوپرادمین. عاملی جز خودِ کاربرِ
    // تازه‌ساخته‌شده وجود ندارد (این مسیر عمداً بدون لاگین است، پشتِ یک secret مشترک)،
    // پس userId هم خودِ همین رکورد است.
    await this.auditLog.record({
      action: 'CREATE',
      entityType: 'User',
      entityId: user.id,
      userId: user.id,
      newData: rest,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return rest;
  }
}
// ❌ خط تکراری را حذف کنید
// export class AuthService {}