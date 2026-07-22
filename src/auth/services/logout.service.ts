import { Injectable, Logger } from '@nestjs/common';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

@Injectable()
export class LogoutService {
  private readonly logger = new Logger(LogoutService.name);

  constructor(
    private readonly sessionService: SessionService,
    private readonly tokenService: TokenService,
  ) {}

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.tokenService.hashToken(refreshToken);
    await this.sessionService.revokeByRefreshTokenHash(tokenHash);
    this.logger.log('Session revoked');
  }

  async logoutAllSessions(userId: string): Promise<void> {
    await this.sessionService.revokeAllUserSessions(userId);
    this.logger.log(`All sessions revoked for user: ${userId}`);
  }
}
