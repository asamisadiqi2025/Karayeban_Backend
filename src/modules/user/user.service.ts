import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async create(currentUser: any, dto: CreateUserDto) {
    if (!currentUser || (currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'ADMIN')) {
      throw new ForbiddenException('Not allowed');
    }

    if (dto.isSuperAdmin && currentUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only super admin can set isSuperAdmin');
    }

    if (dto.marketId == null && dto.isSuperAdmin !== true && currentUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('marketId required for non-super-admin');
    }

    const hashed = await bcrypt.hash(dto.password, 10);
    const data: any = { ...dto, password: hashed };

    const user = await this.prisma.user.create({
      data,
      include: { market: true, customRole: true },
    });
    const { password, ...rest } = user as any;
    return rest;
  }

  async update(currentUser: any, id: string, dto: UpdateUserDto) {
    if (!currentUser || (currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'ADMIN')) {
      throw new ForbiddenException('Not allowed');
    }

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.isSuperAdmin && currentUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only super admin can set isSuperAdmin');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { ...dto },
      include: { market: true, customRole: true },
    });
    const { password, ...rest } = updated as any;
    return rest;
  }

  async findMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { market: true, customRole: true } });
    if (!user) throw new NotFoundException('User not found');
    const { password, ...rest } = user as any;
    return rest;
  }

  async findAll(query: { marketId?: string; role?: string; skip?: number; take?: number }, currentUser: any) {
    const where: any = {};
    if (query.marketId) where.marketId = query.marketId;
    if (query.role) where.role = query.role;

    if (currentUser.role !== 'SUPER_ADMIN') where.marketId = currentUser.marketId;

    const users = await this.prisma.user.findMany({ where, skip: query.skip, take: query.take, include: { market: true, customRole: true } });
    return users.map((u: any) => {
      const { password, ...rest } = u;
      return rest;
    });
  }
}
