import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

import { TokenService } from './services/token.service';
import { SessionService } from './services/session.service';
import { PermissionService } from './services/permission.service';
import { RegisterService } from './services/register.service';
import { LoginService } from './services/login.service';
import { LogoutService } from './services/logout.service';
import { RefreshTokenService } from './services/refresh-token.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: (configService.get<string>('JWT_ACCESS_EXPIRES') ?? '15m') as StringValue,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    TokenService,
    SessionService,
    PermissionService,
    RegisterService,
    LoginService,
    LogoutService,
    RefreshTokenService,
  ],
  exports: [AuthService, JwtModule, TokenService, PermissionService],
})
export class AuthModule {}
