import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../common/audit-log/audit-log.service';
import { RequestMeta } from '../../common/audit-log/request-meta.util';
import { ensureMarketSetupComplete } from '../../common/utils/ensure-market-setup-complete';
import { cleanName } from '../../common/utils/category-name';
import { paginate, resolveSort, buildSearchWhere } from '../../common/utils/pagination';
import { CreateDealerDto } from './dto/create-dealer.dto';
import { UpdateDealerDto } from './dto/update-dealer.dto';
import { DealerQueryDto } from './dto/dealer-query.dto';
import { DEFAULT_DUE_SOON_DAYS, describeDue, kabulDate, openExposureInBase } from './dealer-due.util';

type Actor = { id: string; role: string; marketId: string | null };

const isAdmin = (actor: Actor) => actor.role === 'SUPER_ADMIN' || actor.role === 'ADMIN';

@Injectable()
export class DealersService {
  private static readonly SORT_FIELDS = ['fullName', 'createdAt'] as const;
  private static readonly SEARCH_FIELDS = ['fullName', 'fatherName', 'contact', 'idNumber'] as const;

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

  private ensureAccess(actor: Actor, dealerMarketId: string) {
    if (actor.role === 'SUPER_ADMIN') return;
    if (actor.marketId !== dealerMarketId) {
      throw new ForbiddenException('دسترسی به این دیلر مجاز نیست');
    }
  }

  private resolveMarketId(actor: Actor, providedMarketId: string | undefined): string {
    if (actor.role === 'SUPER_ADMIN') {
      if (!providedMarketId) {
        throw new BadRequestException('برای سوپر ادمین، marketId الزامی است');
      }
      return providedMarketId;
    }
    if (!actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }
    return actor.marketId;
  }

  private async findOrThrow(id: string) {
    const dealer = await this.prisma.dealer.findUnique({ where: { id } });
    if (!dealer) throw new NotFoundException('دیلر یافت نشد');
    return dealer;
  }

  private async handleIdNumberConflict(e: any, marketId: string, idNumber: string | undefined): Promise<never> {
    if (e?.code === 'P2002' && idNumber) {
      const existing = await this.prisma.dealer.findFirst({
        where: { marketId, idNumber },
        select: { id: true, fullName: true },
      });
      throw new ConflictException(
        existing
          ? `دیلری با شمارهٔ تذکرهٔ «${idNumber}» قبلاً با نام «${existing.fullName}» ثبت شده است`
          : `شمارهٔ تذکرهٔ «${idNumber}» در این بازار قبلاً ثبت شده است`,
      );
    }
    throw e;
  }

  async create(currentUser: { id: string }, dto: CreateDealerDto, meta: RequestMeta) {
    const actor = await this.getActor(currentUser);
    const marketId = this.resolveMarketId(actor, dto.marketId);
    await ensureMarketSetupComplete(this.prisma, marketId);

    if (dto.creditLimit !== undefined && !isAdmin(actor)) {
      throw new ForbiddenException('تعیین سقفِ اعتبار فقط توسط ادمین ممکن است');
    }

    const fullName = cleanName(dto.fullName);
    if (!fullName) throw new BadRequestException('نام دیلر نمی‌تواند خالی باشد');
    const idNumber = dto.idNumber?.trim() || undefined;

    try {
      const dealer = await this.prisma.dealer.create({
        data: {
          marketId,
          fullName,
          fatherName: dto.fatherName ? cleanName(dto.fatherName) || null : null,
          grandfatherName: dto.grandfatherName ? cleanName(dto.grandfatherName) || null : null,
          type: dto.type ?? 'EMPLOYEE',
          idNumber: idNumber ?? null,
          contact: dto.contact?.trim() || null,
          details: dto.details?.trim() || null,
          creditLimit: dto.creditLimit !== undefined ? new Prisma.Decimal(dto.creditLimit) : null,
        },
      });

      await this.auditLog.record({
        action: 'CREATE',
        entityType: 'Dealer',
        entityId: dealer.id,
        marketId,
        userId: actor.id,
        newData: dealer,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return dealer;
    } catch (e) {
      return this.handleIdNumberConflict(e, marketId, idNumber);
    }
  }

  // باقی‌ماندهٔ بازِ هر دیلر به تفکیکِ ارز + نزدیک‌ترین سررسید — با دو groupBy برای کلِ صفحه
  // (نه یک کوئری به‌ازای هر دیلر).
  private async balancesFor(dealerIds: string[]) {
    if (dealerIds.length === 0) {
      return { balances: new Map<string, { currencyId: string; currencyCode: string | null; amount: Prisma.Decimal; count: number }[]>(), nextDue: new Map<string, Date>() };
    }
    const [byCurrency, dues] = await Promise.all([
      this.prisma.dealerLoan.groupBy({
        by: ['dealerId', 'currencyId'],
        where: { dealerId: { in: dealerIds }, status: 'OPEN' },
        _sum: { remainingAmount: true },
        _count: { _all: true },
      }),
      this.prisma.dealerLoan.groupBy({
        by: ['dealerId'],
        where: { dealerId: { in: dealerIds }, status: 'OPEN', dueDate: { not: null } },
        _min: { dueDate: true },
      }),
    ]);

    const currencyIds = [...new Set(byCurrency.map((g) => g.currencyId))];
    const currencies = currencyIds.length
      ? await this.prisma.currency.findMany({ where: { id: { in: currencyIds } }, select: { id: true, code: true } })
      : [];
    const codeById = new Map(currencies.map((c) => [c.id, c.code]));

    const balances = new Map<string, { currencyId: string; currencyCode: string | null; amount: Prisma.Decimal; count: number }[]>();
    for (const g of byCurrency) {
      const list = balances.get(g.dealerId) ?? [];
      list.push({
        currencyId: g.currencyId,
        currencyCode: codeById.get(g.currencyId) ?? null,
        amount: g._sum.remainingAmount ?? new Prisma.Decimal(0),
        count: g._count._all,
      });
      balances.set(g.dealerId, list);
    }
    const nextDue = new Map<string, Date>();
    for (const d of dues) if (d._min.dueDate) nextDue.set(d.dealerId, d._min.dueDate);
    return { balances, nextDue };
  }

  async findAll(currentUser: { id: string }, query: DealerQueryDto) {
    const actor = await this.getActor(currentUser);
    const where: any = {};
    if (actor.role === 'SUPER_ADMIN') {
      if (query.marketId) where.marketId = query.marketId;
    } else {
      if (!actor.marketId) throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
      where.marketId = actor.marketId;
    }
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.type !== undefined) where.type = query.type;
    if (query.hasDebt === true) where.loans = { some: { status: 'OPEN' } };
    if (query.hasDebt === false) where.loans = { none: { status: 'OPEN' } };

    const searchWhere = buildSearchWhere(DealersService.SEARCH_FIELDS, query.search);
    if (searchWhere) where.AND = [searchWhere];

    const orderBy = resolveSort(query.sortBy, query.sortOrder, DealersService.SORT_FIELDS, { fullName: 'asc' });

    const result = await paginate(this.prisma.dealer, { where, orderBy, page: query.page, limit: query.limit });
    const { balances, nextDue } = await this.balancesFor(result.data.map((d) => d.id));
    const today = kabulDate();

    return {
      ...result,
      data: result.data.map((d) => {
        const due = nextDue.get(d.id) ?? null;
        return {
          ...d,
          openBalances: balances.get(d.id) ?? [],
          nextDueDate: due,
          nextDueStatus: due ? describeDue({ status: 'OPEN', dueDate: due }, today, DEFAULT_DUE_SOON_DAYS).dueStatus : null,
        };
      }),
    };
  }

  async findOne(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const dealer = await this.findOrThrow(id);
    this.ensureAccess(actor, dealer.marketId);

    const today = kabulDate();
    const [{ balances, nextDue }, exposure, overdueCount] = await Promise.all([
      this.balancesFor([id]),
      openExposureInBase(this.prisma, id),
      this.prisma.dealerLoan.count({ where: { dealerId: id, status: 'OPEN', dueDate: { lt: today } } }),
    ]);

    const due = nextDue.get(id) ?? null;
    return {
      ...dealer,
      openBalances: balances.get(id) ?? [],
      nextDueDate: due,
      nextDueStatus: due ? describeDue({ status: 'OPEN', dueDate: due }, today, DEFAULT_DUE_SOON_DAYS).dueStatus : null,
      overdueLoansCount: overdueCount,
      openExposureInBase: exposure,
      availableCredit: dealer.creditLimit ? Prisma.Decimal.max(dealer.creditLimit.sub(exposure), 0) : null,
    };
  }

  async update(currentUser: { id: string }, id: string, dto: UpdateDealerDto, meta: RequestMeta) {
    const actor = await this.getActor(currentUser);
    const dealer = await this.findOrThrow(id);
    this.ensureAccess(actor, dealer.marketId);

    if (dto.creditLimit !== undefined && !isAdmin(actor)) {
      throw new ForbiddenException('تغییر سقفِ اعتبار فقط توسط ادمین ممکن است');
    }

    const data: Record<string, unknown> = {};
    if (dto.fullName !== undefined) {
      const fullName = cleanName(dto.fullName);
      if (!fullName) throw new BadRequestException('نام دیلر نمی‌تواند خالی باشد');
      data.fullName = fullName;
    }
    if (dto.fatherName !== undefined) data.fatherName = cleanName(dto.fatherName) || null;
    if (dto.grandfatherName !== undefined) data.grandfatherName = cleanName(dto.grandfatherName) || null;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.idNumber !== undefined) data.idNumber = dto.idNumber.trim() || null;
    if (dto.contact !== undefined) data.contact = dto.contact.trim() || null;
    if (dto.details !== undefined) data.details = dto.details.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.creditLimit !== undefined) {
      data.creditLimit = dto.creditLimit === null ? null : new Prisma.Decimal(dto.creditLimit);
    }

    try {
      const updated = await this.prisma.dealer.update({ where: { id }, data });

      await this.auditLog.record({
        action: 'UPDATE',
        entityType: 'Dealer',
        entityId: id,
        marketId: dealer.marketId,
        userId: actor.id,
        oldData: dealer,
        newData: updated,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return updated;
    } catch (e) {
      return this.handleIdNumberConflict(e, dealer.marketId, dto.idNumber?.trim());
    }
  }

  async remove(currentUser: { id: string }, id: string, meta: RequestMeta) {
    const actor = await this.getActor(currentUser);
    const dealer = await this.findOrThrow(id);
    this.ensureAccess(actor, dealer.marketId);

    const loansCount = await this.prisma.dealerLoan.count({ where: { dealerId: id } });
    if (loansCount > 0) {
      throw new ConflictException('این دیلر سابقهٔ قرض دارد و قابل حذف نیست؛ می‌توانید او را غیرفعال کنید');
    }

    await this.prisma.dealer.delete({ where: { id } });

    await this.auditLog.record({
      action: 'DELETE',
      entityType: 'Dealer',
      entityId: id,
      marketId: dealer.marketId,
      userId: actor.id,
      oldData: dealer,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return { message: `دیلر «${dealer.fullName}» حذف شد` };
  }

  // صورت‌حسابِ یک دیلر: همهٔ قرض‌ها با بازپرداخت‌هایشان + جمعِ کل به تفکیکِ ارز.
  async getStatement(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const dealer = await this.findOrThrow(id);
    this.ensureAccess(actor, dealer.marketId);

    const loans = await this.prisma.dealerLoan.findMany({
      where: { dealerId: id },
      orderBy: { loanDate: 'desc' },
      take: 500,
      include: {
        currency: { select: { id: true, code: true } },
        account: { select: { id: true, name: true } },
        repayments: {
          orderBy: { repaymentDate: 'asc' },
          select: { id: true, amount: true, repaymentDate: true, accountId: true, details: true, exchangeRate: true, baseCurrencyAmount: true },
        },
      },
    });

    const today = kabulDate();
    const totals = new Map<string, { currencyId: string; currencyCode: string; totalLent: Prisma.Decimal; totalRepaid: Prisma.Decimal; totalRemaining: Prisma.Decimal }>();
    for (const l of loans) {
      const t = totals.get(l.currencyId) ?? {
        currencyId: l.currencyId,
        currencyCode: l.currency.code,
        totalLent: new Prisma.Decimal(0),
        totalRepaid: new Prisma.Decimal(0),
        totalRemaining: new Prisma.Decimal(0),
      };
      t.totalLent = t.totalLent.add(l.amount);
      t.totalRepaid = t.totalRepaid.add(l.repaidAmount);
      t.totalRemaining = t.totalRemaining.add(l.remainingAmount);
      totals.set(l.currencyId, t);
    }

    return {
      dealer,
      totalsByCurrency: [...totals.values()],
      loans: loans.map((l) => ({ ...l, ...describeDue(l, today, DEFAULT_DUE_SOON_DAYS) })),
    };
  }
}
