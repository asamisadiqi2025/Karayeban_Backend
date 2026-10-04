import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'your_fallback_secret_key'), // ✅ fallback
    });
  }

  // هر درخواست یک خواندنِ ساده از دیتابیس (کلید اصلی) دارد تا این‌ها فوری اثر کنند:
  //  - کاربرِ غیرفعال/حذف‌شده بلافاصله بیرون می‌رود،
  //  - با تغییرِ رمز (passwordChangedAt) همهٔ توکن‌های قدیمی رد می‌شوند،
  //  - نقش از دیتابیس خوانده می‌شود، نه از توکن — تغییرِ نقش بدونِ منتظر ماندنِ انقضای JWT اعمال می‌شود.
  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { email: true, role: true, isActive: true, isDeleted: true, passwordChangedAt: true },
    });
    if (!user || !user.isActive || user.isDeleted === true) {
      throw new UnauthorizedException('Authentication required');
    }
    // iat بر حسبِ ثانیه است؛ با کفِ ثانیه مقایسه می‌شود تا توکنی که همان لحظه بعد از تغییرِ رمز
    // صادر شده به‌اشتباه رد نشود.
    if (
      user.passwordChangedAt &&
      typeof payload.iat === 'number' &&
      payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)
    ) {
      throw new UnauthorizedException('Session expired, please log in again');
    }
    return { id: payload.sub, email: user.email, role: user.role };
  }
}
