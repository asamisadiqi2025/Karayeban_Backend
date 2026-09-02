import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { paginate, resolveSort, buildSearchWhere } from '../../common/utils/pagination';
import * as bcrypt from 'bcrypt';

type Actor = { id: string; role: string; marketId: string | null };

@Injectable()
export class UserService {
  private static readonly SORT_FIELDS = ['fullName', 'createdAt'] as const;
  private static readonly SEARCH_FIELDS = ['fullName', 'username', 'email'] as const;

  constructor(private readonly prisma: PrismaService) {}

  // JWT در حال حاضر marketId را حمل نمی‌کند (ن.ک. jwt.strategy.ts)، پس همیشه از دیتابیس
  // تازه خوانده می‌شود تا نقش/بازار واقعی کاربر معلوم باشد — قبل از این fix، findAll برای
  // هر ADMIN همیشه where.marketId را undefined می‌ساخت (یعنی همهٔ کاربران همهٔ بازارها دیده می‌شدند).
  private async getActor(currentUser: { id: string }): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, role: true, marketId: true },
    });
    if (!user) throw new ForbiddenException('کاربر معتبر نیست');
    return user;
  }

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

    const { password, ...rest } = dto;
    const passwordHash = await bcrypt.hash(password, 10);
    const data: any = { ...rest, passwordHash };

    const user = await this.prisma.user.create({
      data,
      include: { market: true, customRole: true },
    });
    const { passwordHash: _hash, ...safeUser } = user as any;
    return safeUser;
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
    const { passwordHash, ...safeUser } = updated as any;
    return safeUser;
  }

  async findMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { market: true, customRole: true } });
    if (!user) throw new NotFoundException('User not found');
    const { passwordHash, ...safeUser } = user as any;
    return safeUser;
  }

  async findAll(query: UserQueryDto, currentUser: { id: string }) {
    const actor = await this.getActor(currentUser);

    const where: any = {};
    if (query.marketId) where.marketId = query.marketId;
    if (query.role) where.role = query.role;
    if (actor.role !== 'SUPER_ADMIN') where.marketId = actor.marketId;

    const searchWhere = buildSearchWhere(UserService.SEARCH_FIELDS, query.search);
    if (searchWhere) Object.assign(where, searchWhere);

    const orderBy = resolveSort(query.sortBy, query.sortOrder, UserService.SORT_FIELDS, {
      createdAt: 'desc',
    });

    const result = await paginate(this.prisma.user, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      include: { market: true, customRole: true },
    });

    return {
      ...result,
      data: result.data.map((u: any) => {
        const { passwordHash, ...safeUser } = u;
        return safeUser;
      }),
    };
  }
}
