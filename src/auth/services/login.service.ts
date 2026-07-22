import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { compare } from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from './token.service';
import { LoginDto } from '../dto/login.dto';
import { ensureUserIsActive } from '../../common/utils/check-user-status';

@Injectable()
export class LoginService {
  private readonly logger = new Logger(LoginService.name);
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MINUTES = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async login(dto: LoginDto, userAgent?: string, ipAddress?: string) {
    const username = dto.username.trim().toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: { username, deletedAt: null },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      this.logger.warn(`Locked account login attempt: ${username}`);
      throw new UnauthorizedException('Account is temporarily locked. Please try again later.');
    }

    const passwordMatched = await compare(dto.password, user.passwordHash);

    if (!passwordMatched) {
      await this.handleFailedLogin(user.id, username);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'ACTIVE') {
      ensureUserIsActive(user.status);
    }

    await this.resetFailedAttempts(user.id);
    await this.updateLastLogin(user.id);

    this.logger.log(`User logged in: ${username} (${user.id})`);

    return this.tokenService.generateAuthResponse(user as any, userAgent, ipAddress);
  }

  private async handleFailedLogin(userId: string, username: string) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: { increment: 1 },
      },
      select: { failedLoginAttempts: true },
    });

    this.logger.warn(`Failed login attempt for ${username} (${updated.failedLoginAttempts}/${this.MAX_FAILED_ATTEMPTS})`);

    if (updated.failedLoginAttempts >= this.MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date();
      lockedUntil.setMinutes(lockedUntil.getMinutes() + this.LOCKOUT_DURATION_MINUTES);

      await this.prisma.user.update({
        where: { id: userId },
        data: { lockedUntil },
      });

      this.logger.warn(`Account locked: ${username} until ${lockedUntil.toISOString()}`);
    }
  }

  private async resetFailedAttempts(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  private async updateLastLogin(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }
}
