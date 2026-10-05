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
import { ensureCurrencyEnabledForMarket } from '../../common/utils/ensure-currency-enabled-for-market';
import { resolveRateToBase } from '../../common/utils/resolve-rate-to-base';
import { paginate, resolveSort, buildSearchWhere } from '../../common/utils/pagination';
import { CreateDealerLoanDto } from './dto/create-dealer-loan.dto';
import { UpdateDealerLoanDto } from './dto/update-dealer-loan.dto';
import { CreateDealerRepaymentDto } from './dto/create-dealer-repayment.dto';
import { DealerLoanQueryDto } from './dto/dealer-loan-query.dto';
import { DealerLoanAlertQueryDto } from './dto/dealer-loan-alert-query.dto';
import {
  DEFAULT_DUE_SOON_DAYS,
  addDays,
  describeDue,
  kabulDate,
  openExposureInBase,
  parseDateOnly,
} from './dealer-due.util';

type Actor = { id: string; role: string; marketId: string | null };

const LOAN_INCLUDE = {
  dealer: { select: { id: true, fullName: true, contact: true } },
  currency: { select: { id: true, code: true } },
  account: { select: { id: true, name: true } },
} satisfies Prisma.DealerLoanInclude;

@Injectable()
export class DealerLoansService {
  private static readonly SORT_FIELDS = ['loanDate', 'dueDate', 'amount', 'remainingAmount', 'createdAt'] as const;
  private static readonly SEARCH_FIELDS = ['dealer.fullName', 'details'] as const;
  private static readonly ALERT_LIMIT = 200;

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

  private ensureAccess(actor: Actor, marketId: string) {
    if (actor.role === 'SUPER_ADMIN') return;
    if (actor.marketId !== marketId) {
      throw new ForbiddenException('دسترسی به این قرض مجاز نیست');
    }
  }

  // محدوده‌ٔ بازار برای لیست/گزارش: سوپرادمین اختیاری (همه یا یک بازار)، بقیه همیشه بازار خودشان.
  private marketScope(actor: Actor, marketId?: string): { marketId?: string } {
    if (actor.role === 'SUPER_ADMIN') return marketId ? { marketId } : {};
    if (!actor.marketId) throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    return { marketId: actor.marketId };
  }

  private async findLoanOrThrow(id: string) {
    const loan = await this.prisma.dealerLoan.findUnique({ where: { id } });
    if (!loan) throw new NotFoundException('قرض یافت نشد');
    return loan;
  }

  private present<T extends { status: string; dueDate: Date | null }>(
    loan: T,
    today = kabulDate(),
    soonDays = DEFAULT_DUE_SOON_DAYS,
  ) {
    return { ...loan, ...describeDue(loan, today, soonDays) };
  }

  private async loadUsableAccount(marketId: string, accountId: string) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account || account.deletedAt) throw new NotFoundException('حساب یافت نشد');
    if (account.marketId !== marketId) {
      throw new BadRequestException('حساب باید متعلق به همان بازار باشد');
    }
    if (!account.isActive) throw new ConflictException('حساب غیرفعال است');
    await ensureCurrencyEnabledForMarket(this.prisma, marketId, account.currencyId);
    return account;
  }

  // ==========================================================================
  // ثبتِ قرض: پول از یک حسابِ دفتر بیرون می‌رود.
  // ==========================================================================
  async create(currentUser: { id: string }, dto: CreateDealerLoanDto, meta: RequestMeta) {
    const actor = await this.getActor(currentUser);

    const dealer = await this.prisma.dealer.findUnique({ where: { id: dto.dealerId } });
    if (!dealer) throw new NotFoundException('دیلر یافت نشد');
    this.ensureAccess(actor, dealer.marketId);
    if (!dealer.isActive) {
      throw new ConflictException('دیلر غیرفعال است و قرضِ تازه نمی‌گیرد؛ اول او را فعال کنید');
    }
    const marketId = dealer.marketId;
    await ensureMarketSetupComplete(this.prisma, marketId);

    const account = await this.loadUsableAccount(marketId, dto.accountId);
    const currencyId = account.currencyId;

    const amount = new Prisma.Decimal(dto.amount);
    const loanDate = dto.loanDate ? new Date(dto.loanDate) : new Date();
    const dueDate = dto.dueDate ? parseDateOnly(dto.dueDate) : null;
    if (dueDate && dueDate < kabulDate(loanDate)) {
      throw new BadRequestException('تاریخ سررسید نمی‌تواند قبل از تاریخ قرض باشد');
    }

    return this.prisma.$transaction(async (tx) => {
      // قفلِ ردیفِ دیلر: دو قرضِ هم‌زمان برای یک نفر پشتِ هم اجرا می‌شوند، پس سقفِ اعتبار
      // با هم‌زمانی دور زده نمی‌شود.
      await tx.$queryRaw`SELECT id FROM dealers WHERE id = ${dealer.id}::uuid FOR UPDATE`;
      const fresh = await tx.dealer.findUniqueOrThrow({
        where: { id: dealer.id },
        select: { isActive: true, creditLimit: true, fullName: true },
      });
      if (!fresh.isActive) {
        throw new ConflictException('دیلر غیرفعال است و قرضِ تازه نمی‌گیرد');
      }

      const rate = await resolveRateToBase(tx, {
        marketId,
        currencyId,
        date: loanDate,
        amount,
        manualRate: dto.exchangeRate,
      });

      if (fresh.creditLimit) {
        const exposure = await openExposureInBase(tx, dealer.id);
        const projected = exposure.add(rate.baseCurrencyAmount);
        if (projected.greaterThan(fresh.creditLimit)) {
          throw new ConflictException(
            `سقفِ اعتبارِ «${fresh.fullName}» (${fresh.creditLimit.toString()} به ارز پایه) پر می‌شود: قرضِ بازِ فعلی ${exposure.toString()} + این قرض ${rate.baseCurrencyAmount.toString()} = ${projected.toString()}`,
          );
        }
      }

      const debited = await tx.account.updateMany({
        where: { id: account.id, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });
      if (debited.count === 0) {
        throw new ConflictException(`موجودی حساب «${account.name}» برای این قرض کافی نیست`);
      }
      const updatedAccount = await tx.account.findUniqueOrThrow({ where: { id: account.id } });

      const loan = await tx.dealerLoan.create({
        data: {
          marketId,
          dealerId: dealer.id,
          accountId: account.id,
          currencyId,
          amount,
          repaidAmount: new Prisma.Decimal(0),
          remainingAmount: amount,
          loanDate,
          dueDate,
          exchangeRate: rate.exchangeRate,
          baseCurrencyAmount: rate.baseCurrencyAmount,
          details: dto.details?.trim() || null,
          createdById: actor.id,
        },
        include: LOAN_INCLUDE,
      });

      await tx.ledgerEntry.create({
        data: {
          marketId,
          accountId: account.id,
          currencyId,
          direction: 'OUT',
          amount,
          balanceAfter: updatedAccount.balance,
          exchangeRate: rate.exchangeRate,
          baseCurrencyAmount: rate.baseCurrencyAmount,
          entryDate: loanDate,
          description: `قرض به «${fresh.fullName}»`,
          dealerLoanId: loan.id,
          createdById: actor.id,
        },
      });

      await this.auditLog.record({
        tx,
        action: 'CREATE',
        entityType: 'DealerLoan',
        entityId: loan.id,
        marketId,
        userId: actor.id,
        newData: loan,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return this.present(loan);
    });
  }

  // ==========================================================================
  // بازپرداخت (کامل یا بخشی): پول به یک حسابِ دفتر برمی‌گردد.
  // ==========================================================================
  async repay(currentUser: { id: string }, loanId: string, dto: CreateDealerRepaymentDto, meta: RequestMeta) {
    const actor = await this.getActor(currentUser);
    const loan = await this.findLoanOrThrow(loanId);
    this.ensureAccess(actor, loan.marketId);
    if (loan.status !== 'OPEN') {
      throw new ConflictException('این قرض کاملاً تسویه شده و بازپرداختِ تازه نمی‌پذیرد');
    }

    const account = await this.loadUsableAccount(loan.marketId, dto.accountId);
    if (account.currencyId !== loan.currencyId) {
      throw new BadRequestException('ارزِ حساب باید با ارزِ قرض یکی باشد');
    }

    const amount = new Prisma.Decimal(dto.amount);
    if (amount.greaterThan(loan.remainingAmount)) {
      throw new BadRequestException(
        `مبلغ بازپرداخت (${amount.toString()}) از باقی‌ماندهٔ قرض (${loan.remainingAmount.toString()}) بیشتر است`,
      );
    }
    const repaymentDate = dto.repaymentDate ? new Date(dto.repaymentDate) : new Date();
    if (kabulDate(repaymentDate) < kabulDate(loan.loanDate)) {
      throw new BadRequestException('تاریخ بازپرداخت نمی‌تواند قبل از تاریخ قرض باشد');
    }

    return this.prisma.$transaction(async (tx) => {
      const rate = await resolveRateToBase(tx, {
        marketId: loan.marketId,
        currencyId: loan.currencyId,
        date: repaymentDate,
        amount,
        manualRate: dto.exchangeRate,
      });

      // کاهشِ اتمیک: اگر هم‌زمان بازپرداختِ دیگری باقی‌مانده را کم کرده باشد، count=0 می‌شود.
      const applied = await tx.dealerLoan.updateMany({
        where: { id: loan.id, status: 'OPEN', remainingAmount: { gte: amount } },
        data: { repaidAmount: { increment: amount }, remainingAmount: { decrement: amount } },
      });
      if (applied.count === 0) {
        throw new ConflictException('باقی‌ماندهٔ قرض هم‌زمان تغییر کرد یا کافی نیست؛ دوباره تلاش کنید');
      }

      let updatedLoan = await tx.dealerLoan.findUniqueOrThrow({ where: { id: loan.id } });
      if (updatedLoan.remainingAmount.isZero()) {
        updatedLoan = await tx.dealerLoan.update({ where: { id: loan.id }, data: { status: 'SETTLED' } });
      }

      const updatedAccount = await tx.account.update({
        where: { id: account.id },
        data: { balance: { increment: amount } },
      });

      const repayment = await tx.dealerRepayment.create({
        data: {
          marketId: loan.marketId,
          loanId: loan.id,
          accountId: account.id,
          amount,
          repaymentDate,
          exchangeRate: rate.exchangeRate,
          baseCurrencyAmount: rate.baseCurrencyAmount,
          details: dto.details?.trim() || null,
          createdById: actor.id,
        },
      });

      const dealer = await tx.dealer.findUniqueOrThrow({ where: { id: loan.dealerId }, select: { fullName: true } });
      await tx.ledgerEntry.create({
        data: {
          marketId: loan.marketId,
          accountId: account.id,
          currencyId: loan.currencyId,
          direction: 'IN',
          amount,
          balanceAfter: updatedAccount.balance,
          exchangeRate: rate.exchangeRate,
          baseCurrencyAmount: rate.baseCurrencyAmount,
          entryDate: repaymentDate,
          description: `بازپرداخت قرض از «${dealer.fullName}»`,
          dealerRepaymentId: repayment.id,
          createdById: actor.id,
        },
      });

      await this.auditLog.record({
        tx,
        action: 'CREATE',
        entityType: 'DealerRepayment',
        entityId: repayment.id,
        marketId: loan.marketId,
        userId: actor.id,
        oldData: { loanId: loan.id, remainingAmount: loan.remainingAmount, status: loan.status },
        newData: { repayment, remainingAmount: updatedLoan.remainingAmount, status: updatedLoan.status },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return {
        repayment,
        loan: this.present(updatedLoan),
        account: { id: updatedAccount.id, balance: updatedAccount.balance },
      };
    });
  }

  async findAll(currentUser: { id: string }, query: DealerLoanQueryDto) {
    const actor = await this.getActor(currentUser);
    const today = kabulDate();
    const soonDays = query.soonDays ?? DEFAULT_DUE_SOON_DAYS;
    const soonEnd = addDays(today, soonDays);

    const where: any = { ...this.marketScope(actor, query.marketId) };
    const and: any[] = [];

    if (query.dealerId) where.dealerId = query.dealerId;
    if (query.currencyId) where.currencyId = query.currencyId;
    if (query.status) where.status = query.status;

    if (query.dueStatus) {
      if (query.status && query.status !== 'OPEN') {
        throw new BadRequestException('dueStatus فقط برای قرض‌های باز معنی دارد');
      }
      where.status = 'OPEN';
      if (query.dueStatus === 'overdue') and.push({ dueDate: { lt: today } });
      if (query.dueStatus === 'due_soon') and.push({ dueDate: { gte: today, lte: soonEnd } });
      if (query.dueStatus === 'ok') and.push({ dueDate: { gt: soonEnd } });
      if (query.dueStatus === 'no_due_date') and.push({ dueDate: null });
    }

    if (query.fromDate || query.toDate) {
      where.loanDate = {
        ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
        ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
      };
    }
    if (query.dueFrom) and.push({ dueDate: { gte: parseDateOnly(query.dueFrom) } });
    if (query.dueTo) and.push({ dueDate: { lte: parseDateOnly(query.dueTo) } });

    const searchWhere = buildSearchWhere(DealerLoansService.SEARCH_FIELDS, query.search);
    if (searchWhere) and.push(searchWhere);
    if (and.length > 0) where.AND = and;

    const orderBy = resolveSort(query.sortBy, query.sortOrder, DealerLoansService.SORT_FIELDS, { loanDate: 'desc' });

    const result = await paginate(this.prisma.dealerLoan, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      include: LOAN_INCLUDE,
    });
    return { ...result, data: result.data.map((l: any) => this.present(l, today, soonDays)) };
  }

  async findOne(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const loan = await this.findLoanOrThrow(id);
    this.ensureAccess(actor, loan.marketId);

    const full = await this.prisma.dealerLoan.findUniqueOrThrow({
      where: { id },
      include: {
        ...LOAN_INCLUDE,
        repayments: {
          orderBy: { repaymentDate: 'asc' },
          include: { account: { select: { id: true, name: true } } },
        },
      },
    });
    return this.present(full);
  }

  // سررسید یا تاریخ قرض را اصلاح می‌کند (مثلاً دیلر وعدهٔ تازه داد) — مبلغ/حساب قابل‌ویرایش نیست.
  async update(currentUser: { id: string }, id: string, dto: UpdateDealerLoanDto, meta: RequestMeta) {
    const actor = await this.getActor(currentUser);
    const loan = await this.findLoanOrThrow(id);
    this.ensureAccess(actor, loan.marketId);

    const data: Record<string, unknown> = {};
    if (dto.dueDate !== undefined) {
      if (loan.status !== 'OPEN') {
        throw new ConflictException('سررسیدِ قرضِ تسویه‌شده قابل تغییر نیست');
      }
      if (dto.dueDate === null) {
        data.dueDate = null;
      } else {
        const dueDate = parseDateOnly(dto.dueDate);
        if (dueDate < kabulDate(loan.loanDate)) {
          throw new BadRequestException('تاریخ سررسید نمی‌تواند قبل از تاریخ قرض باشد');
        }
        data.dueDate = dueDate;
      }
    }
    if (dto.details !== undefined) data.details = dto.details.trim() || null;

    const updated = await this.prisma.dealerLoan.update({ where: { id }, data, include: LOAN_INCLUDE });

    await this.auditLog.record({
      action: 'UPDATE',
      entityType: 'DealerLoan',
      entityId: id,
      marketId: loan.marketId,
      userId: actor.id,
      oldData: loan,
      newData: updated,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return this.present(updated);
  }

  // حذفِ قرضِ اشتباه — فقط وقتی هنوز هیچ بازپرداختی ندارد؛ مبلغ به حساب برمی‌گردد.
  async remove(currentUser: { id: string }, id: string, meta: RequestMeta) {
    const actor = await this.getActor(currentUser);
    const loan = await this.findLoanOrThrow(id);
    this.ensureAccess(actor, loan.marketId);

    const repaymentsCount = await this.prisma.dealerRepayment.count({ where: { loanId: id } });
    if (repaymentsCount > 0 || !loan.repaidAmount.isZero()) {
      throw new ConflictException('این قرض بازپرداخت دارد و قابل حذف نیست');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: loan.accountId },
        data: { balance: { increment: loan.amount } },
      });
      // ردیفِ LedgerEntry مرتبط به‌خاطر onDelete: Cascade خودش پاک می‌شود.
      await tx.dealerLoan.delete({ where: { id } });

      await this.auditLog.record({
        tx,
        action: 'DELETE',
        entityType: 'DealerLoan',
        entityId: id,
        marketId: loan.marketId,
        userId: actor.id,
        oldData: loan,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    });

    return { message: 'قرض حذف شد و مبلغش به حساب برگشت' };
  }

  // ==========================================================================
  // هشدار: قرض‌های بازِ سررسیدگذشته و نزدیک به سررسید (پیش‌فرض ۷ روز).
  // ==========================================================================
  async getAlerts(currentUser: { id: string }, query: DealerLoanAlertQueryDto) {
    const actor = await this.getActor(currentUser);
    const scope = this.marketScope(actor, query.marketId);
    const days = query.days ?? DEFAULT_DUE_SOON_DAYS;
    const today = kabulDate();
    const end = addDays(today, days);

    const base = { ...scope, status: 'OPEN' as const };
    const [loans, overdueCount, dueSoonCount] = await Promise.all([
      this.prisma.dealerLoan.findMany({
        where: { ...base, dueDate: { not: null, lte: end } },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        take: DealerLoansService.ALERT_LIMIT,
        include: LOAN_INCLUDE,
      }),
      this.prisma.dealerLoan.count({ where: { ...base, dueDate: { lt: today } } }),
      this.prisma.dealerLoan.count({ where: { ...base, dueDate: { gte: today, lte: end } } }),
    ]);

    const items = loans.map((l) => this.present(l, today, days));
    const totals = new Map<string, { currencyId: string; currencyCode: string; totalRemaining: Prisma.Decimal; count: number }>();
    for (const l of items) {
      const t = totals.get(l.currencyId) ?? { currencyId: l.currencyId, currencyCode: l.currency.code, totalRemaining: new Prisma.Decimal(0), count: 0 };
      t.totalRemaining = t.totalRemaining.add(l.remainingAmount);
      t.count += 1;
      totals.set(l.currencyId, t);
    }

    return {
      today: today.toISOString().slice(0, 10),
      days,
      overdueCount,
      dueSoonCount,
      truncated: loans.length === DealerLoansService.ALERT_LIMIT,
      totalsByCurrency: [...totals.values()],
      overdue: items.filter((i) => i.dueStatus === 'overdue'),
      dueSoon: items.filter((i) => i.dueStatus === 'due_soon'),
    };
  }

  // خلاصهٔ کل: چقدر قرض داده شده، چقدر برگشته، چقدر مانده — به تفکیکِ ارز.
  async getSummary(currentUser: { id: string }, query: DealerLoanAlertQueryDto) {
    const actor = await this.getActor(currentUser);
    const scope = this.marketScope(actor, query.marketId);
    const days = query.days ?? DEFAULT_DUE_SOON_DAYS;
    const today = kabulDate();
    const end = addDays(today, days);
    const open = { ...scope, status: 'OPEN' as const };

    const [byCurrency, openByCurrency, dealersWithDebt, overdueCount, dueSoonCount] = await Promise.all([
      this.prisma.dealerLoan.groupBy({
        by: ['currencyId'],
        where: scope,
        _sum: { amount: true, repaidAmount: true, remainingAmount: true },
        _count: { _all: true },
      }),
      this.prisma.dealerLoan.groupBy({ by: ['currencyId'], where: open, _count: { _all: true } }),
      this.prisma.dealerLoan.groupBy({ by: ['dealerId'], where: open }),
      this.prisma.dealerLoan.count({ where: { ...open, dueDate: { lt: today } } }),
      this.prisma.dealerLoan.count({ where: { ...open, dueDate: { gte: today, lte: end } } }),
    ]);

    const currencies = byCurrency.length
      ? await this.prisma.currency.findMany({
          where: { id: { in: byCurrency.map((g) => g.currencyId) } },
          select: { id: true, code: true },
        })
      : [];
    const codeById = new Map(currencies.map((c) => [c.id, c.code]));
    const openCountById = new Map(openByCurrency.map((g) => [g.currencyId, g._count._all]));

    // مجموعِ باقی‌ماندهٔ قرض‌های باز به ارز پایه (هر قرض با نرخِ همان روزِ قرض). فقط وقتی یک مارکت
    // مشخص باشد معنی دارد (مارکت‌های مختلف ارز پایهٔ متفاوت دارند).
    let totalRemainingInBase: Prisma.Decimal | null = null;
    if (scope.marketId) {
      const rows = await this.prisma.$queryRaw<{ t: string }[]>(Prisma.sql`
        SELECT COALESCE(sum(remaining_amount * exchange_rate), 0)::text AS t
        FROM dealer_loans
        WHERE market_id = ${scope.marketId}::uuid AND status = 'OPEN' AND exchange_rate IS NOT NULL`);
      totalRemainingInBase = new Prisma.Decimal(rows[0]?.t ?? '0').toDecimalPlaces(4);
    }

    return {
      days,
      totalRemainingInBase,
      dealersWithDebt: dealersWithDebt.length,
      overdueLoans: overdueCount,
      dueSoonLoans: dueSoonCount,
      byCurrency: byCurrency.map((g) => ({
        currencyId: g.currencyId,
        currencyCode: codeById.get(g.currencyId) ?? null,
        loansCount: g._count._all,
        openLoansCount: openCountById.get(g.currencyId) ?? 0,
        totalLent: g._sum.amount ?? new Prisma.Decimal(0),
        totalRepaid: g._sum.repaidAmount ?? new Prisma.Decimal(0),
        totalRemaining: g._sum.remainingAmount ?? new Prisma.Decimal(0),
      })),
    };
  }
}
