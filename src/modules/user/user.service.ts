import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
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

  // نقش و بازارِ ادمین از دیتابیس خوانده می‌شود (نه از JWT). ADMIN فقط در بازارِ خودش و فقط
  // نقش‌های ACCOUNTANT/STAFF را می‌سازد/ویرایش می‌کند؛ ساختِ ADMIN/SUPER_ADMIN با SUPER_ADMIN است.
  private static readonly ADMIN_ASSIGNABLE_ROLES = ['ACCOUNTANT', 'STAFF'];

  private async ensureCustomRoleInMarket(customRoleId: string | null | undefined, marketId: string | null) {
    if (!customRoleId) return;
    const role = await this.prisma.customRole.findUnique({
      where: { id: customRoleId },
      select: { marketId: true },
    });
    if (!role) throw new NotFoundException('نقش سفارشی یافت نشد');
    if (role.marketId !== marketId) {
      throw new BadRequestException('نقش سفارشی باید متعلق به همان بازارِ کاربر باشد');
    }
  }

  private handleUniqueConflict(e: any): never {
    if (e?.code === 'P2002') {
      const target = Array.isArray(e.meta?.target) ? e.meta.target.join(', ') : '';
      throw new ConflictException(
        `این مقدار قبلاً ثبت شده است${target ? ` (${target})` : ''} — نام کاربری، ایمیل یا شمارهٔ تذکره تکراری است`,
      );
    }
    throw e;
  }

  async create(currentUser: any, dto: CreateUserDto, meta: RequestMeta) {
    if (!currentUser) throw new ForbiddenException('Not allowed');
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'ADMIN') {
      throw new ForbiddenException('Not allowed');
    }

    let marketId: string | null | undefined = dto.marketId;

    if (actor.role === 'ADMIN') {
      if (!actor.marketId) throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
      if (dto.marketId && dto.marketId !== actor.marketId) {
        throw new ForbiddenException('فقط می‌توانید برای بازارِ خودتان کاربر بسازید');
      }
      if (dto.isSuperAdmin || !UserService.ADMIN_ASSIGNABLE_ROLES.includes(dto.role)) {
        throw new ForbiddenException('ادمین فقط می‌تواند کاربرِ حسابدار (ACCOUNTANT) یا کارمند (STAFF) بسازد');
      }
      marketId = actor.marketId;
    } else if (marketId) {
      const market = await this.prisma.market.findUnique({ where: { id: marketId }, select: { id: true } });
      if (!market) throw new NotFoundException('مارکت یافت نشد');
    }

    await this.ensureCustomRoleInMarket(dto.customRoleId, marketId ?? null);

    const { password, ...rest } = dto;
    const passwordHash = await bcrypt.hash(password, 10);
    const data: any = { ...rest, marketId: marketId ?? null, passwordHash };

    let user;
    try {
      user = await this.prisma.user.create({
        data,
        include: { market: true, customRole: true },
      });
    } catch (e) {
      this.handleUniqueConflict(e);
    }
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
    if (!currentUser) throw new ForbiddenException('Not allowed');
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'ADMIN') {
      throw new ForbiddenException('Not allowed');
    }

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (actor.role === 'ADMIN') {
      if (!actor.marketId || user.marketId !== actor.marketId) {
        throw new ForbiddenException('دسترسی به این کاربر مجاز نیست');
      }
      const isSelf = user.id === actor.id;
      if (!isSelf && !UserService.ADMIN_ASSIGNABLE_ROLES.includes(user.role)) {
        throw new ForbiddenException('ادمین فقط کاربرانِ حسابدار (ACCOUNTANT) و کارمند (STAFF) را ویرایش می‌کند');
      }
      if (dto.isSuperAdmin !== undefined) {
        throw new ForbiddenException('Only super admin can set isSuperAdmin');
      }
      if (dto.marketId !== undefined && dto.marketId !== actor.marketId) {
        throw new ForbiddenException('ادمین نمی‌تواند بازارِ کاربر را تغییر دهد');
      }
      if (dto.role !== undefined && (isSelf ? dto.role !== user.role : !UserService.ADMIN_ASSIGNABLE_ROLES.includes(dto.role))) {
        throw new ForbiddenException('ادمین فقط می‌تواند نقشِ حسابدار (ACCOUNTANT) یا کارمند (STAFF) بدهد و نقشِ خودش را تغییر نمی‌دهد');
      }
    }

    if (dto.customRoleId !== undefined) {
      await this.ensureCustomRoleInMarket(dto.customRoleId, dto.marketId ?? user.marketId);
    }

    let updated;
    try {
      updated = await this.prisma.user.update({
        where: { id },
        data: { ...dto },
        include: { market: true, customRole: true },
      });
    } catch (e) {
      this.handleUniqueConflict(e);
    }

    if (dto.profilePhoto !== undefined && dto.profilePhoto !== user.profilePhoto) {
      await this.uploadsService.deleteByUrl(user.profilePhoto);
    }
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
