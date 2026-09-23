import { Controller, Post, Body, UseGuards, Req, Get, HttpCode } from '@nestjs/common';
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

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, extractRequestMeta(req));
  }

  @Public()
  @Post('register-super-admin')
  async registerSuperAdmin(@Body() dto: RegisterSuperAdminDto, @Req() req: Request) {
    return this.authService.registerSuperAdmin(dto, extractRequestMeta(req));
  }

  @Public()
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