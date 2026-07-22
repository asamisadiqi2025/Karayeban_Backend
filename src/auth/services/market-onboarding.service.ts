import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from './token.service';
import { PermissionService } from './permission.service';
import { CreateMarketDto } from '../dto/create-market.dto';
import { ROLES, ROLE_PERMISSIONS } from '../constants';
import { ensureUserIsActive } from '../../common/utils/check-user-status';
import { generateId } from '../../common/utils/uuid.util';


@Injectable()
export class MarketOnboardingService {
  private readonly logger = new Logger(MarketOnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly permissionService: PermissionService,
  ) {}

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

      this.logger.log(`Market created: ${market.name} (${market.id}) by user ${userId}`);

      return reloadedUser;
    });

    return this.tokenService.generateAuthResponse(updatedUser, userAgent, ipAddress);
  }
}
