import { Injectable } from '@nestjs/common';
import { RegisterService } from './services/register.service';
import { LoginService } from './services/login.service';
import { LogoutService } from './services/logout.service';
import { RefreshTokenService } from './services/refresh-token.service';
import { MarketOnboardingService } from './services/market-onboarding.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { CreateMarketDto } from './dto/create-market.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly registerService: RegisterService,
    private readonly loginService: LoginService,
    private readonly logoutService: LogoutService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly marketOnboardingService: MarketOnboardingService,
  ) {}

  register(dto: RegisterDto) {
    return this.registerService.register(dto);
  }

  login(dto: LoginDto, userAgent?: string, ip?: string) {
    return this.loginService.login(dto, userAgent, ip);
  }

  logout(refreshToken: string) {
    return this.logoutService.logout(refreshToken);
  }

  refresh(refreshToken: string, userAgent?: string, ip?: string) {
    return this.refreshTokenService.refresh(refreshToken, userAgent, ip);
  }

  createMarket(
    userId: string,
    dto: CreateMarketDto,
    userAgent?: string,
    ip?: string,
  ) {
    return this.marketOnboardingService.createMarket(userId, dto, userAgent, ip);
  }
}
