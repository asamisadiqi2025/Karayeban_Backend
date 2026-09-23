import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { paginate, resolveSort } from '../../common/utils/pagination';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

type Actor = { id: string; role: string; marketId: string | null };

const ACTOR_SELECT = { id: true, fullName: true, username: true } as const;

// این سرویس فقط می‌خواند — نوشتن روی AuditLog منحصراً از AuditLogService (common/audit-log)
// انجام می‌شود، همان‌جایی که همهٔ سرویس‌های دیگر برای ثبت audit صدا می‌زنند. جدا نگه‌داشتنِ
// خواندن/نوشتن عمدی است: این سرویس هیچ متد create/update/delete ندارد و نباید داشته باشد.
@Injectable()
export class AuditLogsService {
  private static readonly SORT_FIELDS = ['createdAt', 'action', 'entityType'] as const;

  constructor(private readonly prisma: PrismaService) {}

  private async getActor(currentUser: { id: string }): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, role: true, marketId: true },
    });
    if (!user) throw new ForbiddenException('کاربر معتبر نیست');
    return user;
  }

  async findAll(currentUser: { id: string }, query: AuditLogQueryDto) {
    const actor = await this.getActor(currentUser);

    const where: Prisma.AuditLogWhereInput = {};
    if (query.marketId !== undefined) where.marketId = query.marketId;
    if (query.action !== undefined) where.action = query.action;
    if (query.entityType !== undefined) where.entityType = query.entityType;
    if (query.entityId !== undefined) where.entityId = query.entityId;
    if (query.userId !== undefined) where.userId = query.userId;
    if (query.fromDate !== undefined || query.toDate !== undefined) {
      where.createdAt = {
        ...(query.fromDate !== undefined ? { gte: new Date(query.fromDate) } : {}),
        ...(query.toDate !== undefined ? { lte: new Date(query.toDate) } : {}),
      };
    }

    // مثل همهٔ سرویس‌های دیگر: SUPER_ADMIN هر بازاری را می‌بیند (یا با فیلتر marketId
    // یا همه)، بقیهٔ نقش‌ها همیشه فقط بازار خودشان را — حتی اگر marketId دیگری فرستاده
    // باشند، این‌جا override می‌شود، نه merge.
    if (actor.role !== 'SUPER_ADMIN') {
      if (!actor.marketId) {
        throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
      }
      where.marketId = actor.marketId;
    }

    const orderBy = resolveSort(
      query.sortBy,
      query.sortOrder,
      AuditLogsService.SORT_FIELDS,
      { createdAt: 'desc' },
    );

    return paginate(this.prisma.auditLog, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      include: { user: { select: ACTOR_SELECT } },
    });
  }

  async findOne(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const log = await this.prisma.auditLog.findUnique({
      where: { id },
      include: { user: { select: ACTOR_SELECT } },
    });
    if (!log) throw new NotFoundException('رکورد حسابرسی یافت نشد');
    if (actor.role !== 'SUPER_ADMIN' && log.marketId !== actor.marketId) {
      throw new ForbiddenException('دسترسی به این رکورد مجاز نیست');
    }
    return log;
  }

  // تاریخچهٔ کاملِ یک موجودیت مشخص (مثلاً همهٔ تغییراتِ یک Expense خاص از ساخت تا الان) —
  // صعودی (قدیم به جدید) چون این یک تایم‌لاین است، نه یک لیستِ آخرین‌رویدادها.
  async findForEntity(currentUser: { id: string }, entityType: string, entityId: string) {
    const actor = await this.getActor(currentUser);

    const where: Prisma.AuditLogWhereInput = { entityType, entityId };
    if (actor.role !== 'SUPER_ADMIN') {
      if (!actor.marketId) {
        throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
      }
      where.marketId = actor.marketId;
    }

    return this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { user: { select: ACTOR_SELECT } },
    });
  }
}
