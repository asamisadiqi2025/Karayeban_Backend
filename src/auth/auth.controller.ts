import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { CreateMarketDto } from '../market/dto/create-market.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthUser } from './types/jwt-payload.type';
import { TenantGuard } from './guards/tenant.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private readonly REFRESH_TOKEN_COOKIE = 'refresh_token';
  private readonly COOKIE_PATH = '/auth';

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'] ?? undefined;
    const ipAddress = req.ip;

    const result = await this.authService.login(dto, userAgent, ipAddress);

    this.setRefreshTokenCookie(res, result.refreshToken);

    return {
      accessToken: result.accessToken,
      user: result.user,
      setupRequired: result.setupRequired,
      nextStep: result.nextStep,
    };
  }

  @Public()
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[this.REFRESH_TOKEN_COOKIE];

    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    this.clearRefreshTokenCookie(res);

    return { message: 'Logged out successfully' };
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[this.REFRESH_TOKEN_COOKIE];

    if (!refreshToken) {
      return { accessToken: null, user: null, setupRequired: false };
    }

    const userAgent = req.headers['user-agent'] ?? undefined;
    const ipAddress = req.ip;

    try {
      const result = await this.authService.refresh(
        refreshToken,
        userAgent,
        ipAddress,
      );

      this.setRefreshTokenCookie(res, result.refreshToken);

      return {
        accessToken: result.accessToken,
        user: result.user,
        setupRequired: result.setupRequired,
        nextStep: result.nextStep,
      };
    } catch {
      this.clearRefreshTokenCookie(res);
      return { accessToken: null, user: null, setupRequired: false };
    }
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }

  @Post('create-market')
  @UseGuards(TenantGuard)
  async createMarket(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateMarketDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'] ?? undefined;
    const ipAddress = req.ip;

    const result = await this.authService.createMarket(
      user.id,
      dto,
      userAgent,
      ipAddress,
    );

    this.setRefreshTokenCookie(res, result.refreshToken);

    return {
      accessToken: result.accessToken,
      user: result.user,
      setupRequired: result.setupRequired,
      message: 'Market created successfully',
    };
  }

  private setRefreshTokenCookie(res: Response, token: string) {
    const maxAge = this.parseMaxAge(
      this.configService.get<string>('JWT_REFRESH_EXPIRES') || '30d',
    );

    res.cookie(this.REFRESH_TOKEN_COOKIE, token, {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: this.COOKIE_PATH,
      maxAge,
    });
  }

  private clearRefreshTokenCookie(res: Response) {
    res.cookie(this.REFRESH_TOKEN_COOKIE, '', {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: this.COOKIE_PATH,
      maxAge: 0,
    });
  }

  private parseMaxAge(expiry: string): number {
    const match = expiry.match(/^(\d+)([dhms])$/);
    if (!match) return 30 * 24 * 60 * 60 * 1000;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'm':
        return value * 60 * 1000;
      case 's':
        return value * 1000;
      default:
        return 30 * 24 * 60 * 60 * 1000;
    }
  }
}
