import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DebtPromiseSource, DebtPromiseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../common/audit-log/audit-log.service';
import { RequestMeta } from '../../common/audit-log/request-meta.util';
import { kabulDate } from '../../common/utils/kabul-date';
import { paginate } from '../../common/utils/pagination';
import {
  CancelDebtPromiseDto,
  CreateDebtPromiseDto,
  DebtPromiseQueryDto,
  RescheduleDebtPromiseDto,
} from './dto/debt-promise.dto';
import { collectDebtItems, createDebtPromise, describePromise, parsePromisedDate } from './debt-promise.util';

const NO_REQUEST_META: RequestMeta = { ip: null, userAgent: null };

type Actor = { id: string; role: string; marketId: string | null };

// تعهدِ پرداخت = «مستأجر قول داده تا فلان روز بدهی‌اش را بدهد». ساختنِ خودکارش در فسخ/تمدید با بدهی (در
// ContractsService) است؛ این سرویس فهرستِ پیگیری، ثبتِ دستی، عقب‌انداختنِ تاریخ و لغو را می‌دهد.
@Injectable()
export class DebtPromisesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  private async getActor(currentUser: { id: string }): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, role: true, marketId: true },
    });
    if (!user) throw new ForbiddenException('کاربر معتبر نیست');
    return user;
  }

  private ensureAccess(actor: Actor, entityMarketId: string) {
    if (actor.role === 'SUPER_ADMIN') return;
    if (actor.marketId !== entityMarketId) {
      throw new ForbiddenException('دسترسی به این تعهدِ پرداخت مجاز نیست');
    }
  }

  private resolveMarketId(actor: Actor, provided: string | undefined): string {
    if (actor.role === 'SUPER_ADMIN') {
      if (!provided) throw new BadRequestException('برای سوپر ادمین، marketId الزامی است');
      return provided;
    }
    if (!actor.marketId) throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    return actor.marketId;
  }

  private async findOrThrow(id: string) {
    const p = await this.prisma.debtPromise.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('تعهدِ پرداخت یافت نشد');
    return p;
  }

  // یک ردیف برای پاسخ: مستأجر، دوکان، ضامنِ قرارداد، عکسِ بدهیِ لحظهٔ ثبت و باقی‌ماندهٔ زنده.
  private async toView(
    p: Prisma.DebtPromiseGetPayload<{
      include: {
        tenant: { select: { id: true; fullName: true; contact: true } };
        contract: {
          select: {
            id: true;
            status: true;
            shop: { select: { shopNumber: true } };
            guarantor: { select: { id: true; name: true; contact: true } };
          };
        };
        createdBy: { select: { id: true; fullName: true } };
      };
    }>,
  ) {
    const live = await describePromise(this.prisma, p);
    return {
      id: p.id,
      status: p.status,
      source: p.source,
      promisedDate: p.promisedDate,
      isOverdue: live.isOverdue,
      daysOverdue: live.daysOverdue,
      reason: p.reason,
      tenant: p.tenant,
      contract: p.contract
        ? {
            id: p.contract.id,
            status: p.contract.status,
            shopNumber: p.contract.shop?.shopNumber ?? null,
          }
        : null,
      guarantor: p.contract?.guarantor ?? null,
      debtAtPromise: p.snapshot,
      remaining: live.remaining,
      rescheduleCount: p.rescheduleCount,
      fulfilledAt: p.fulfilledAt,
      cancelledAt: p.cancelledAt,
      cancelReason: p.cancelReason,
      createdBy: p.createdBy,
      createdAt: p.createdAt,
    };
  }

  private static readonly INCLUDE = {
    tenant: { select: { id: true, fullName: true, contact: true } },
    contract: {
      select: {
        id: true,
        status: true,
        shop: { select: { shopNumber: true } },
        guarantor: { select: { id: true, name: true, contact: true } },
      },
    },
    createdBy: { select: { id: true, fullName: true } },
  } as const;

  async findAll(currentUser: { id: string }, query: DebtPromiseQueryDto) {
    const actor = await this.getActor(currentUser);
    const marketId = this.resolveMarketId(actor, query.marketId);
    const status = query.status ?? 'OPEN';
    const today = kabulDate();

    const where: Prisma.DebtPromiseWhereInput = { marketId };
    if (status !== 'ALL') where.status = status as DebtPromiseStatus;
    if (query.tenantId) where.tenantId = query.tenantId;

    // «عقب‌افتاده» = باز و تاریخِ وعده قبل از امروزِ کابل (بسته‌شدنِ خودکار تضمین می‌کند که باز یعنی بدهی مانده).
    if (query.overdue) {
      where.status = DebtPromiseStatus.OPEN;
      where.promisedDate = { lt: today };
    } else if (query.dueWithinDays !== undefined) {
      const until = new Date(today.getTime() + query.dueWithinDays * 86_400_000);
      where.status = DebtPromiseStatus.OPEN;
      where.promisedDate = { gte: today, lte: until };
    }
    if (query.search?.trim()) {
      where.tenant = { fullName: { contains: query.search.trim(), mode: 'insensitive' } };
    }

    const page = await paginate(this.prisma.debtPromise, {
      where,
      orderBy: { promisedDate: query.sortOrder === 'desc' && query.sortBy === 'promisedDate' ? 'desc' : 'asc' },
      page: query.page,
      limit: query.limit,
      include: DebtPromisesService.INCLUDE,
    });
    return { ...page, data: await Promise.all(page.data.map((p: any) => this.toView(p))) };
  }

  async findOne(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const p = await this.findOrThrow(id);
    this.ensureAccess(actor, p.marketId);
    const full = await this.prisma.debtPromise.findUniqueOrThrow({
      where: { id },
      include: DebtPromisesService.INCLUDE,
    });
    return this.toView(full);
  }

  async create(currentUser: { id: string }, dto: CreateDebtPromiseDto, meta: RequestMeta = NO_REQUEST_META) {
    const actor = await this.getActor(currentUser);
    const marketId = this.resolveMarketId(actor, dto.marketId);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.tenantId } });
    if (!tenant) throw new NotFoundException('مستأجر یافت نشد');
    if (tenant.marketId !== marketId) throw new BadRequestException('مستأجر باید متعلق به همان بازار باشد');
    const promisedDate = parsePromisedDate(dto.promisedDate);

    const created = await this.prisma.$transaction(async (tx) => {
      const items = await collectDebtItems(tx, { tenantId: tenant.id, rentScope: 'due', wholeTenant: true });
      if (items.rent.length === 0 && items.bills.length === 0) {
        throw new BadRequestException('این مستأجر بدهیِ بازی ندارد که برایش تعهدِ پرداخت ثبت شود');
      }
      const res = await createDebtPromise(tx, {
        marketId,
        tenantId: tenant.id,
        source: DebtPromiseSource.MANUAL,
        promisedDate,
        reason: dto.reason,
        createdById: actor.id,
        items,
      });
      await this.auditLog.record({
        tx,
        action: 'CREATE',
        entityType: 'DebtPromise',
        entityId: res.promise.id,
        marketId,
        userId: actor.id,
        newData: { ...res.promise, supersededIds: res.supersededIds },
        reason: dto.reason,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return res.promise;
    });
    return this.findOne(currentUser, created.id);
  }

  async reschedule(
    currentUser: { id: string },
    id: string,
    dto: RescheduleDebtPromiseDto,
    meta: RequestMeta = NO_REQUEST_META,
  ) {
    const actor = await this.getActor(currentUser);
    const p = await this.findOrThrow(id);
    this.ensureAccess(actor, p.marketId);
    if (p.status !== DebtPromiseStatus.OPEN) {
      throw new ConflictException('فقط تعهدِ باز قابل تغییرِ تاریخ است');
    }
    const promisedDate = parsePromisedDate(dto.promisedDate);

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.debtPromise.update({
        where: { id },
        data: { promisedDate, rescheduleCount: { increment: 1 } },
      });
      await this.auditLog.record({
        tx,
        action: 'UPDATE',
        entityType: 'DebtPromise',
        entityId: id,
        marketId: p.marketId,
        userId: actor.id,
        oldData: { promisedDate: p.promisedDate, rescheduleCount: p.rescheduleCount },
        newData: { promisedDate: updated.promisedDate, rescheduleCount: updated.rescheduleCount },
        reason: dto.reason,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    });
    return this.findOne(currentUser, id);
  }

  async cancel(currentUser: { id: string }, id: string, dto: CancelDebtPromiseDto, meta: RequestMeta = NO_REQUEST_META) {
    const actor = await this.getActor(currentUser);
    const p = await this.findOrThrow(id);
    this.ensureAccess(actor, p.marketId);
    if (p.status !== DebtPromiseStatus.OPEN) {
      throw new ConflictException('فقط تعهدِ باز قابل لغو است');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.debtPromise.update({
        where: { id },
        data: { status: DebtPromiseStatus.CANCELLED, cancelledAt: new Date(), cancelReason: dto.reason.trim() },
      });
      await this.auditLog.record({
        tx,
        action: 'UPDATE',
        entityType: 'DebtPromise',
        entityId: id,
        marketId: p.marketId,
        userId: actor.id,
        oldData: { status: p.status },
        newData: { status: DebtPromiseStatus.CANCELLED },
        reason: dto.reason,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    });
    return this.findOne(currentUser, id);
  }
}
