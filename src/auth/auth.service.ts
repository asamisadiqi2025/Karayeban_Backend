import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RegisterService } from './services/register.service';
import { LoginService } from './services/login.service';
import { LogoutService } from './services/logout.service';
import { RefreshTokenService } from './services/refresh-token.service';
import { TokenService } from './services/token.service';
import { PermissionService } from './services/permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { CreateMarketDto } from '../market/dto/create-market.dto';
import { ROLES, ROLE_PERMISSIONS } from './constants';
import { ensureUserIsActive } from '../common/utils/check-user-status';
import { generateId } from '../common/utils/uuid.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly registerService: RegisterService,
    private readonly loginService: LoginService,
    private readonly logoutService: LogoutService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly tokenService: TokenService,
    private readonly permissionService: PermissionService,
    private readonly prisma: PrismaService,
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

  async createMarket(
    userId: string,
    dto: CreateMarketDto,
    userAgent?: string,
    ipAddress?: string,
  ) {
    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
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
        throw new UnauthorizedException('User not found');
      }

      ensureUserIsActive(user.status);

      if (user.marketId) {
        throw new ConflictException('User already belongs to a market');
      }

      const market = await tx.market.create({
        data: {
          id: generateId(),
          name: dto.name.trim(),
          code: dto.code.trim().toUpperCase(),
          address: dto.address?.trim(),
          phone: dto.phone?.trim(),
        },
      });

      const ownerRole = await this.permissionService.findOrCreateRole(
        tx,
        ROLES.MARKET_OWNER,
        'GLOBAL',
      );

      await this.permissionService.seedRolePermissions(
        tx,
        ownerRole.id,
        ROLE_PERMISSIONS[ROLES.MARKET_OWNER],
      );

      await this.permissionService.ensureUserRole(tx, user.id, ownerRole.id);

      await tx.user.update({
        where: { id: user.id },
        data: { marketId: market.id },
      });

      await tx.userMarket.upsert({
        where: {
          userId_marketId: {
            userId: user.id,
            marketId: market.id,
          },
        },
        create: {
          id: generateId(),
          userId: user.id,
          marketId: market.id,
          isActive: true,
        },
        update: {},
      });

      const reloadedUser = await tx.user.findUnique({
        where: { id: user.id },
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

      if (!reloadedUser) {
        throw new UnauthorizedException('User not found after update');
      }

      return reloadedUser;
    });

    return this.tokenService.generateAuthResponse(updatedUser, userAgent, ipAddress);
  }
}
