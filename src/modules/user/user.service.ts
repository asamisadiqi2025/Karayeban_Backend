import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { paginate, resolveSort, buildSearchWhere } from '../../common/utils/pagination';
import * as bcrypt from 'bcrypt';
import { UploadsService } from '../uploads/uploads.service';
import { AuditLogService } from '../../common/audit-log/audit-log.service';
import { RequestMeta } from '../../common/audit-log/request-meta.util';

type Actor = { id: string; role: string; marketId: string | null };

@Injectable()
export class UserService {
  private static readonly SORT_FIELDS = ['fullName', 'createdAt'] as const;
  private static readonly SEARCH_FIELDS = ['fullName', 'username', 'email'] as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadsService: UploadsService,
    private readonly auditLog: AuditLogService,
  ) {}

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

  async create(currentUser: any, dto: CreateUserDto, meta: RequestMeta) {
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

    // passwordHash عمداً حتی در audit هم ذخیره نمی‌شود — safeUser از قبل بدون آن است.
    await this.auditLog.record({
      action: 'CREATE',
      entityType: 'User',
      entityId: user.id,
      marketId: user.marketId,
      userId: currentUser.id,
      newData: safeUser,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return safeUser;
  }

  async update(currentUser: any, id: string, dto: UpdateUserDto, meta: RequestMeta) {
    if (!currentUser || (currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'ADMIN')) {
      throw new ForbiddenException('Not allowed');
    }

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.isSuperAdmin && currentUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only super admin can set isSuperAdmin');
    }

    if (dto.profilePhoto !== undefined && dto.profilePhoto !== user.profilePhoto) {
      await this.uploadsService.deleteByUrl(user.profilePhoto);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { ...dto },
      include: { market: true, customRole: true },
    });
    const { passwordHash, ...safeUser } = updated as any;
    const { passwordHash: _oldHash, ...safeOldUser } = user as any;

    // role/customRoleId/isSuperAdmin/marketId دقیقاً همان فیلدهایی‌اند که این متد
    // می‌تواند تغییر دهد — یعنی هر تغییرِ نقش یا دسترسی از همین‌جا رد می‌شود و در
    // audit ثبت می‌شود؛ بدون نیاز به یک مسیرِ جداگانه برای «تغییرِ نقش».
    await this.auditLog.record({
      action: 'UPDATE',
      entityType: 'User',
      entityId: id,
      marketId: updated.marketId ?? user.marketId,
      userId: currentUser.id,
      oldData: safeOldUser,
      newData: safeUser,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return safeUser;
  }

  async findMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { market: true, customRole: true } });
    if (!user) throw new NotFoundException('User not found');
    const { passwordHash, ...safeUser } = user as any;
    return safeUser;
  }

  // برای دیدنِ کاملِ پروفایلِ یک کاربرِ دیگر (نه خودت) — همان جزئیاتی که findMe/findAll
  // برمی‌گردانند، ولی برای یک id مشخص. ADMIN فقط کاربرانِ همان بازارِ خودش را می‌بیند؛
  // SUPER_ADMIN هرکسی را.
  async findOne(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { market: true, customRole: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (actor.role !== 'SUPER_ADMIN' && user.marketId !== actor.marketId) {
      throw new ForbiddenException('دسترسی به این کاربر مجاز نیست');
    }
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
