import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { ensureUserIsActive } from '../../common/utils/check-user-status';

type UserWithRoles = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  marketId: string | null;
  status: string;
  roles: {
    role: {
      name: string;
      permissions: {
        permission: {
          name: string;
        };
      }[];
    };
  }[];
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    username: string;
    email: string | null;
    marketId: string | null;
    roles: string[];
    permissions: string[];
  };
  setupRequired: boolean;
  nextStep: 'CREATE_MARKET' | undefined;
};

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  createAccessToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload);
  }

  generateRefreshToken(): string {
    return randomBytes(48).toString('hex');
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  buildJwtPayload(user: UserWithRoles, roles: string[], permissions: string[]): JwtPayload {
    return {
      sub: user.id,
      username: user.username,
      marketId: user.marketId,
      roles,
      permissions,
      type: 'access',
    };
  }

  async generateAuthResponse(
    user: UserWithRoles,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<AuthResponse> {
    ensureUserIsActive(user.status);

    const { roles, permissions } = this.extractRolesAndPermissions(user);

    const payload = this.buildJwtPayload(user, roles, permissions);
    const accessToken = this.createAccessToken(payload);

    const refreshToken = this.generateRefreshToken();
    const refreshTokenHash = this.hashToken(refreshToken);

    const refreshExpiry = this.configService.get<string>('JWT_REFRESH_EXPIRES') ?? '30d';
    const expiresAt = new Date(Date.now() + this.parseExpiry(refreshExpiry));

    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        userAgent,
        ipAddress,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        marketId: user.marketId,
        roles,
        permissions,
      },
      setupRequired: !user.marketId,
      nextStep: !user.marketId ? 'CREATE_MARKET' : undefined,
    };
  }

  extractRolesAndPermissions(user: UserWithRoles): {
    roles: string[];
    permissions: string[];
  } {
    const roles = user.roles.map((ur) => ur.role.name);
    const permissionSet = new Set<string>();

    for (const userRole of user.roles) {
      for (const rolePermission of userRole.role.permissions) {
        permissionSet.add(rolePermission.permission.name);
      }
    }

    return {
      roles,
      permissions: [...permissionSet],
    };
  }

  parseExpiry(expiry: string): number {
    const match = /^(\d+)([smhd])$/.exec(expiry);
    if (!match) return 30 * 24 * 60 * 60 * 1000;

    const value = Number(match[1]);
    switch (match[2]) {
      case 's': return value * 1000;
      case 'm': return value * 60_000;
      case 'h': return value * 3_600_000;
      case 'd': return value * 86_400_000;
      default: return 30 * 24 * 60 * 60 * 1000;
    }
  }
}
