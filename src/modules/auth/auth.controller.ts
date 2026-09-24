import { Controller, Post, Body, UseGuards, Req, Get, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterSuperAdminDto } from './dto/register-super-admin.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from '../../common/decorators/public.decorator';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { extractRequestMeta } from '../../common/audit-log/request-meta.util';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // هدفِ کلاسیکِ brute-force؛ محدودیتِ سراسری (۱۰۰/دقیقه) اینجا کافی نیست — ۵ تلاش
  // در دقیقه به‌ازای هر IP، هرچند کاربر بخواهد باشد.
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, extractRequestMeta(req));
  }

  // حساس‌ترین endpoint کل سیستم (ساختِ سوپرادمین، فقط پشتِ یک secret) — محدودیتِ حتی
  // سخت‌گیرانه‌تر از لاگین.
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('register-super-admin')
  async registerSuperAdmin(@Body() dto: RegisterSuperAdminDto, @Req() req: Request) {
    return this.authService.registerSuperAdmin(dto, extractRequestMeta(req));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @UseGuards(RefreshTokenGuard)
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: any) {
    return this.authService.refresh(dto.refreshToken, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.authService.logout(dto.refreshToken, extractRequestMeta(req));
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: any) {
    return req.user;
  }
}
// ❌ export class AuthController {} را حذف کنید