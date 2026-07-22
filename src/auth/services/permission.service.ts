import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES, ROLE_PERMISSIONS } from '../constants';
import { Prisma } from '../../generated/prisma/client';

type RoleWithPermissions = {
  role: {
    name: string;
    permissions: {
      permission: {
        name: string;
      };
    }[];
  };
};

@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  extractRolesAndPermissions(userRoles: RoleWithPermissions[]): {
    roles: string[];
    permissions: string[];
  } {
    const roles = userRoles.map((ur) => ur.role.name);
    const permissionSet = new Set<string>();

    for (const userRole of userRoles) {
      for (const rolePermission of userRole.role.permissions) {
        permissionSet.add(rolePermission.permission.name);
      }
    }

    return {
      roles,
      permissions: [...permissionSet],
    };
  }

  async findOrCreateRole(
    tx: Prisma.TransactionClient,
    roleName: string,
    scope: 'GLOBAL' | 'MARKET' = 'GLOBAL',
  ) {
    let role = await tx.role.findFirst({
      where: { name: roleName, deletedAt: null },
    });

    if (!role) {
      role = await tx.role.create({
        data: { name: roleName, scope },
      });
    }

    return role;
  }

  async seedRolePermissions(
    tx: Prisma.TransactionClient,
    roleId: string,
    permissionNames: readonly string[],
  ) {
    for (const permName of permissionNames) {
      const [resource, action] = permName.split('.');

      let permission = await tx.permission.findUnique({
        where: { name: permName },
      });

      if (!permission) {
        permission = await tx.permission.create({
          data: {
            name: permName,
            resource: resource ?? permName,
            action: action ?? 'manage',
          },
        });
      }

      await tx.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId,
            permissionId: permission.id,
          },
        },
        create: {
          roleId,
          permissionId: permission.id,
        },
        update: {},
      });
    }
  }

  async ensureUserRole(
    tx: Prisma.TransactionClient,
    userId: string,
    roleId: string,
  ) {
    const existing = await tx.userRole.findFirst({
      where: { userId, roleId, deletedAt: null },
    });

    if (!existing) {
      await tx.userRole.create({
        data: { userId, roleId },
      });
    }
  }
}
