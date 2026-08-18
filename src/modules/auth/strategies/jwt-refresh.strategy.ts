import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      secretOrKey: config.get<string>('JWT_SECRET', 'your_fallback_secret_key'), // ✅ fallback
      passReqToCallback: false,
      ignoreExpiration: false,
    });
  }

  async validate(payload: any) {
    if (!payload) throw new UnauthorizedException();
    return payload;
  }
}