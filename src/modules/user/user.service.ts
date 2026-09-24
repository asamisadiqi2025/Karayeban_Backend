import { BadRequestException, Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
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

  async create(currentUser: { id: string }, dto: CreateUserDto, meta: RequestMeta) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'ADMIN') {
      throw new ForbiddenException('Not allowed');
    }

    if (dto.isSuperAdmin && actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only super admin can set isSuperAdmin');
    }

    // marketId همیشه از رویِ actor واقعی تعیین می‌شود، نه چیزی که ADMIN در بدنهٔ
    // درخواست فرستاده — وگرنه یک ADMIن می‌توانست کاربر را داخل بازارِ دیگری بسازد.
    let marketId: string | null;
    if (actor.role === 'SUPER_ADMIN') {
      if (dto.marketId == null && dto.isSuperAdmin !== true) {
        throw new ForbiddenException('marketId required for non-super-admin');
      }
      marketId = dto.marketId ?? null;
    } else {
      if (!actor.marketId) {
        throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
      }
      marketId = actor.marketId;
    }

    // تشدید امتیاز: ADMIN فقط می‌تواند ACCOUNTANT/STAFF بسازد — نه ADMIN، نه
    // SUPER_ADMIN. ساختن ادمین کارِ SUPER_ADMIN است.
    if (actor.role === 'ADMIN' && dto.role !== 'ACCOUNTANT' && dto.role !== 'STAFF') {
      throw new ForbiddenException('ادمین فقط می‌تواند کاربرِ حسابدار یا کارمند بسازد');
    }

    if (dto.customRoleId) {
      const customRole = await this.prisma.customRole.findUnique({
        where: { id: dto.customRoleId },
      });
      if (!customRole) throw new NotFoundException('نقش سفارشی یافت نشد');
      if (customRole.marketId !== marketId) {
        throw new BadRequestException('نقش سفارشی باید متعلق به همان بازارِ کاربر باشد');
      }
    }

    const { password, marketId: _ignoredMarketId, ...rest } = dto;
    const passwordHash = await bcrypt.hash(password, 10);
    const data: any = { ...rest, marketId, passwordHash };

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

  async update(currentUser: { id: string }, id: string, dto: UpdateUserDto, meta: RequestMeta) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'ADMIN') {
      throw new ForbiddenException('Not allowed');
    }

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (actor.role === 'ADMIN') {
      // ADMIN فقط کاربرانِ همان بازارِ خودش را می‌بیند/ویرایش می‌کند — نه هیچ بازار دیگری.
      if (user.marketId !== actor.marketId) {
        throw new ForbiddenException('دسترسی به این کاربر مجاز نیست');
      }
      if (dto.marketId !== undefined && dto.marketId !== actor.marketId) {
        throw new ForbiddenException('ادمین نمی‌تواند کاربر را به بازارِ دیگری منتقل کند');
      }
      if (dto.role !== undefined && dto.role !== 'ACCOUNTANT' && dto.role !== 'STAFF') {
        throw new ForbiddenException('ادمین فقط می‌تواند نقش را به حسابدار یا کارمند تغییر دهد');
      }
    }

    if (dto.isSuperAdmin && actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only super admin can set isSuperAdmin');
    }

    if (dto.customRoleId) {
      const effectiveMarketId = dto.marketId ?? user.marketId;
      const customRole = await this.prisma.customRole.findUnique({
        where: { id: dto.customRoleId },
      });
      if (!customRole) throw new NotFoundException('نقش سفارشی یافت نشد');
      if (customRole.marketId !== effectiveMarketId) {
        throw new BadRequestException('نقش سفارشی باید متعلق به همان بازارِ کاربر باشد');
      }
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
