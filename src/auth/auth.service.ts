import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { ensureUserIsActive } from '../common/utils/check-user-status';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { CreateMarketDto } from './dto/create-market.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { AuthUser } from './types/jwt-payload.type';
import { ROLES, ROLE_PERMISSIONS } from './constants';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ───────────────────────────────
  //  REGISTER
  // ───────────────────────────────

  async register(dto: RegisterDto) {
    const normalizedUsername = dto.username.toLowerCase();
    const normalizedEmail = dto.email?.toLowerCase();

    const exists = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: normalizedUsername },
          ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
        ],
      },
    });

    if (exists) {
      throw new ConflictException('کاربر از قبل موجود است');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        username: normalizedUsername,
        email: normalizedEmail,
        passwordHash,
      },
    });

    return {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
    };
  }

  // ───────────────────────────────
  //  LOGIN
  // ───────────────────────────────

  async login(dto: LoginDto, userAgent?: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        username: dto.username.toLowerCase(),
      },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    ensureUserIsActive(user.status);

    return this.generateAuthResponse(user, userAgent, ipAddress);
  }

  // ───────────────────────────────
  //  LOGOUT
  // ───────────────────────────────

  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);

    await this.prisma.session.updateMany({
      where: {
        refreshTokenHash: tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  // ───────────────────────────────
  //  REFRESH (with rotation)
  // ───────────────────────────────

  async refresh(refreshToken: string, userAgent?: string, ipAddress?: string) {
    const tokenHash = this.hashToken(refreshToken);

    const session = await this.prisma.session.findUnique({
      where: {
        refreshTokenHash: tokenHash,
      },
      include: {
        user: {
          include: {
            roles: {
              include: {
                role: {
                  include: {
                    permissions: {
                      include: {
                        permission: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!session || session.revokedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // ✅ Check account status
    ensureUserIsActive(session.user.status);

    // Revoke current session
    await this.prisma.session.update({
      where: {
        id: session.id,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return this.generateAuthResponse(session.user, userAgent, ipAddress);
  }

  // ───────────────────────────────
  //  CREATE MARKET (onboarding)
  // ───────────────────────────────

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
                    include: {
                      permission: true,
                    },
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

      // -----------------------------
      // Create Market
      // -----------------------------

      const market = await tx.market.create({
        data: {
          name: dto.name,
          code: dto.code,
          address: dto.address,
          phone: dto.phone,
        },
      });

      // -----------------------------
      // Upsert MARKET_OWNER role
      // -----------------------------

      const ownerRole = await tx.role.upsert({
        where: {
          name: ROLES.MARKET_OWNER,
        },
        create: {
          name: ROLES.MARKET_OWNER,
        },
        update: {},
      });

      // -----------------------------
      // Seed permissions
      // -----------------------------

      for (const permName of ROLE_PERMISSIONS[ROLES.MARKET_OWNER]) {
        const permission = await tx.permission.upsert({
          where: {
            name: permName,
          },
          create: {
            name: permName,
          },
          update: {},
        });

        await tx.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: ownerRole.id,
              permissionId: permission.id,
            },
          },
          create: {
            roleId: ownerRole.id,
            permissionId: permission.id,
          },
          update: {},
        });
      }

      // -----------------------------
      // Assign Role
      // -----------------------------

      await tx.userRole.upsert({
        where: {
          userId_roleId: {
            userId: user.id,
            roleId: ownerRole.id,
          },
        },
        create: {
          userId: user.id,
          roleId: ownerRole.id,
        },
        update: {},
      });

      // -----------------------------
      // Update User
      // -----------------------------

      await tx.user.update({
        where: {
          id: user.id,
        },
        data: {
          marketId: market.id,
        },
      });

      // -----------------------------
      // Create Membership
      // -----------------------------

      await tx.userMarket.upsert({
        where: {
          userId_marketId: {
            userId: user.id,
            marketId: market.id,
          },
        },
        create: {
          userId: user.id,
          marketId: market.id,
          isActive: true,
        },
        update: {},
      });

      // -----------------------------
      // Reload User
      // -----------------------------

      const updatedUser = await tx.user.findUnique({
        where: {
          id: user.id,
        },
        include: {
          roles: {
            include: {
              role: {
                include: {
                  permissions: {
                    include: {
                      permission: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!updatedUser) {
        throw new UnauthorizedException('User not found');
      }

      return updatedUser;
    });

    return this.generateAuthResponse(updatedUser, userAgent, ipAddress);
  }

  // ───────────────────────────────
  //  HELPERS
  // ───────────────────────────────

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateSecureToken(): string {
    return randomBytes(48).toString('hex');
  }

  private extractRolesAndPermissions(user: any): {
    roles: string[];
    permissions: string[];
  } {
    const roles = user.roles?.map((ur: any) => ur.role.name) ?? [];
    const permissions: string[] = [];

    for (const ur of user.roles ?? []) {
      for (const rp of ur.role.permissions ?? []) {
        if (!permissions.includes(rp.permission.name)) {
          permissions.push(rp.permission.name);
        }
      }
    }

    return { roles, permissions };
  }

  private async generateAuthResponse(
    user: any,
    userAgent?: string,
    ipAddress?: string,
  ) {
    // ✅ Check account status
    ensureUserIsActive(user.status);

    const { roles, permissions } = this.extractRolesAndPermissions(user);

    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      marketId: user.marketId,
      roles,
      permissions,
      type: 'access',
    };

    const accessToken = this.jwtService.sign(payload);

    const refreshToken = this.generateSecureToken();

    const refreshTokenHash = this.hashToken(refreshToken);

    const refreshExpiresIn =
      this.configService.get<string>('JWT_REFRESH_EXPIRES') || '30d';

    const expiresMs = this.parseExpiry(refreshExpiresIn);

    const expiresAt = new Date(Date.now() + expiresMs);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        userAgent,
        ipAddress,
        expiresAt,
      },
    });

    const authUser: AuthUser = {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      marketId: user.marketId,
      roles,
      permissions,
    };

    const setupRequired = !user.marketId;

    return {
      accessToken,
      refreshToken,
      user: authUser,
      setupRequired,
      nextStep: setupRequired ? 'CREATE_MARKET' : undefined,
    };
  }

  private parseExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)([dhms])$/);
    if (!match) return 30 * 24 * 60 * 60 * 1000; // default 30d

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
