import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from './token.service';
import { SessionService } from './session.service';
import { ensureUserIsActive } from '../../common/utils/check-user-status';

@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
  ) {}

  async refresh(refreshToken: string, userAgent?: string, ipAddress?: string) {
    const tokenHash = this.tokenService.hashToken(refreshToken);

    const session = await this.sessionService.findByRefreshTokenHash(tokenHash);

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.revokedAt) {
      this.logger.error(
        `Refresh token reuse detected for user ${session.userId}. Revoking all sessions.`,
      );
      await this.sessionService.revokeAllUserSessions(session.userId);
      throw new UnauthorizedException('Token reuse detected. All sessions revoked.');
    }

    if (session.expiresAt < new Date()) {
      await this.sessionService.revokeById(session.id);
      throw new UnauthorizedException('Refresh token expired');
    }

    ensureUserIsActive(session.user.status);

    const newRefreshToken = this.tokenService.generateRefreshToken();
    const newRefreshTokenHash = this.tokenService.hashToken(newRefreshToken);

    const refreshExpiry = this.configService.get<string>('JWT_REFRESH_EXPIRES') ?? '30d';
    const newExpiresAt = new Date(Date.now() + this.tokenService.parseExpiry(refreshExpiry));

    await this.sessionService.revokeById(session.id);

    await this.sessionService.create({
      userId: session.user.id,
      refreshTokenHash: newRefreshTokenHash,
      userAgent,
      ipAddress,
      expiresAt: newExpiresAt,
    });

    this.logger.log(`Session rotated for user: ${session.userId}`);

    return this.tokenService.generateAuthResponse(session.user, userAgent, ipAddress);
  }
}
