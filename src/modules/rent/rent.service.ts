import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Prisma,
  PaymentSourceType,
  RentChargeStatus,
  DebtStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  paginate,
  resolveSort,
  buildSearchWhere,
} from '../../common/utils/pagination';
import { toJalaliYearMonth, AFGHAN_SOLAR_MONTHS } from '../../common/utils/jalali-date';
import { CreateRentPaymentDto } from './dto/create-rent-payment.dto';
import { RentChargeQueryDto } from './dto/rent-charge-query.dto';
import { RentPaymentQueryDto } from './dto/rent-payment-query.dto';
import { RentDebtQueryDto } from './dto/rent-debt-query.dto';

type Actor = { id: string; role: string; marketId: string | null };

type ContractForCharges = {
  id: string;
  marketId: string;
  shopId: string;
  tenantId: string;
  startDate: Date;
  endDate: Date;
  rent: Prisma.Decimal;
  currencyId: string;
};

// export می‌شود چون TenantsService هم برای گزارشِ خلاصهٔ بدهیِ باز هر قرارداد (استیتمنتِ
// مستأجر) به همین لیست وضعیت‌ها نیاز دارد.
export const RENT_OPEN_STATUSES: RentChargeStatus[] = [
  RentChargeStatus.PENDING,
  RentChargeStatus.PARTIAL,
  RentChargeStatus.OVERDUE,
];
const OPEN_STATUSES = RENT_OPEN_STATUSES;

// موتور مرکزی کرایه: تولید فاکتورهای یک قرارداد + تخصیص پرداخت روی آن‌ها (FIFO) + بازمحاسبهٔ
// بدهیِ رولینگِ هر مستأجر. هم از این سرویس مستقیم (پرداخت روزمره) و هم از ContractsService
// (ساخت/فسخ قرارداد، پرداخت افتتاحیهٔ مهاجرت) صدا زده می‌شود.
@Injectable()
export class RentService {
  private static readonly PAYMENT_SORT_FIELDS = [
    'paymentDate',
    'createdAt',
  ] as const;

  constructor(private readonly prisma: PrismaService) {}

  private async getActor(currentUser: { id: string }): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, role: true, marketId: true },
    });
    if (!user) throw new ForbiddenException('کاربر معتبر نیست');
    return user;
  }

  private ensureAccess(actor: Actor, entityMarketId: string, message: string) {
    if (actor.role === 'SUPER_ADMIN') return;
    if (actor.marketId !== entityMarketId) {
      throw new ForbiddenException(message);
    }
  }

  // ==========================================================================
  // تولید فاکتورهای یک قرارداد — یک‌جا، از startDate تا endDate.
  // هر دوره دقیقاً «۱ ماه» از دورهٔ قبلی است (نه لزوماً هم‌راستا با اول ماه تقویمی).
  // dailyRate همیشه بر مبنای طول «طبیعیِ» همان دوره (اگر ناقص نشده بود) حساب می‌شود،
  // تا اگر بعداً با فسخ زودهنگام کوتاه شد، فرمول روزانهٔ درست از قبل ذخیره باشد.
  // ==========================================================================
  async generateChargesForContract(
    tx: Prisma.TransactionClient,
    contract: ContractForCharges,
  ) {
    let cursor = new Date(contract.startDate);
    const end = new Date(contract.endDate);

    while (cursor < end) {
      const naturalEnd = new Date(cursor);
      naturalEnd.setUTCMonth(naturalEnd.getUTCMonth() + 1);

      const fullPeriodDays = Math.round(
        (naturalEnd.getTime() - cursor.getTime()) / (1000 * 60 * 60 * 24),
      );
      const actualEnd = naturalEnd < end ? naturalEnd : end;
      const actualDays = Math.round(
        (actualEnd.getTime() - cursor.getTime()) / (1000 * 60 * 60 * 24),
      );

      const dailyRate = contract.rent.div(fullPeriodDays);
      const netAmount = dailyRate.mul(actualDays);

      await tx.rentCharges.create({
        data: {
          marketId: contract.marketId,
          contractId: contract.id,
          tenantId: contract.tenantId,
          shopId: contract.shopId,
          periodStart: cursor,
          periodEnd: actualEnd,
          days: actualDays,
          dailyRate,
          grossAmount: netAmount,
          discountAmount: 0,
          netAmount,
          paidAmount: 0,
          remainingAmount: netAmount,
          currencyId: contract.currencyId,
          status: RentChargeStatus.PENDING,
        },
      });

      cursor = actualEnd;
    }
  }

  // ==========================================================================
  // تخصیص یک مبلغ روی قدیمی‌ترین فاکتورهای بازِ یک قرارداد (FIFO).
  // ==========================================================================
  private async allocateToCharges(
    tx: Prisma.TransactionClient,
    contractId: string,
    paymentId: string,
    amount: Prisma.Decimal,
  ) {
    const openCharges = await tx.rentCharges.findMany({
      where: { contractId, status: { in: OPEN_STATUSES } },
      orderBy: { periodStart: 'asc' },
    });

    const totalOutstanding = openCharges.reduce(
      (sum, c) => sum.add(c.remainingAmount),
      new Prisma.Decimal(0),
    );
    if (amount.greaterThan(totalOutstanding)) {
      throw new BadRequestException(
        `مبلغ (${amount.toString()}) از مجموع بدهیِ بازِ این قرارداد (${totalOutstanding.toString()}) بیشتر است`,
      );
    }

    let remaining = amount;
    for (const charge of openCharges) {
      if (remaining.isZero()) break;
      const applyAmount = Prisma.Decimal.min(remaining, charge.remainingAmount);

      await tx.rentPaymentAllocation.create({
        data: { paymentId, rentChargeId: charge.id, amount: applyAmount },
      });

      const newPaid = charge.paidAmount.add(applyAmount);
      const newRemaining = charge.remainingAmount.sub(applyAmount);
      await tx.rentCharges.update({
        where: { id: charge.id },
        data: {
          paidAmount: newPaid,
          remainingAmount: newRemaining,
          status: newRemaining.lessThanOrEqualTo(0)
            ? RentChargeStatus.PAID
            : RentChargeStatus.PARTIAL,
        },
      });

      remaining = remaining.sub(applyAmount);
    }
  }

  // مجموع بدهیِ بازِ کرایهٔ یک قرارداد مشخص — برای تسویه (ContractsService.settle) لازم است.
  async getOpenDebtForContract(
    tx: Prisma.TransactionClient,
    contractId: string,
  ): Promise<Prisma.Decimal> {
    const openCharges = await tx.rentCharges.findMany({
      where: { contractId, status: { in: OPEN_STATUSES } },
    });
    return openCharges.reduce(
      (s, c) => s.add(c.remainingAmount),
      new Prisma.Decimal(0),
    );
  }

  // بخشیدن (write-off) باقی‌ماندهٔ فاکتورهای بازِ یک قرارداد — بدون جابه‌جایی پول.
  // discountAmount بالا می‌رود تا مبلغ اصلی (grossAmount) برای حسابرسی حفظ شود.
  async writeOffOpenCharges(
    tx: Prisma.TransactionClient,
    contractId: string,
    tenantId: string,
    note: string,
  ) {
    const openCharges = await tx.rentCharges.findMany({
      where: { contractId, status: { in: OPEN_STATUSES } },
    });
    for (const charge of openCharges) {
      await tx.rentCharges.update({
        where: { id: charge.id },
        data: {
          discountAmount: charge.discountAmount.add(charge.remainingAmount),
          netAmount: charge.paidAmount,
          remainingAmount: 0,
          status: RentChargeStatus.PAID,
          notes: charge.notes ? `${charge.notes}\n${note}` : note,
        },
      });
    }
    await this.recomputeRentDebt(tx, tenantId);
  }

  // ==========================================================================
  // بازمحاسبهٔ بدهیِ رولینگِ یک مستأجر (روی همهٔ قراردادهایش، نه فقط یکی).
  // public است چون ContractsService هم بعد از فسخ قرارداد باید همین را صدا بزند.
  // ==========================================================================
  async recomputeRentDebt(tx: Prisma.TransactionClient, tenantId: string) {
    const openCharges = await tx.rentCharges.findMany({
      where: { tenantId, status: { in: OPEN_STATUSES } },
    });

    const now = new Date();
    const totalDebt = openCharges.reduce(
      (s, c) => s.add(c.remainingAmount),
      new Prisma.Decimal(0),
    );
    const overdueDebt = openCharges
      .filter((c) => c.periodEnd < now)
      .reduce((s, c) => s.add(c.remainingAmount), new Prisma.Decimal(0));

    // مقیاسِ «چند ماه بدهکار است» — به‌جای Contract.rent (که بعد از adjust-rent دیگر نرخ
    // واقعی نیست و همیشه همان رقم امضاشدهٔ اصلی می‌ماند)، از netAmount آخرین فاکتورِ بازِ
    // همین مستأجر استفاده می‌شود — این همیشه نرخِ واقعاً در حال اعمال است، حتی اگر تخفیف
    // خورده باشد. یک عارضهٔ کوچک: اگر آخرین فاکتور به‌خاطر فسخ زودهنگام کوتاه شده باشد،
    // مقیاس کمی کوچک‌تر از یک ماه کامل می‌شود — قابل قبول چون این فقط یک برچسبِ شدت است،
    // نه مبلغ واقعیِ بدهی (که همیشه دقیق می‌ماند). این تغییر یک query کامل (roundtrip به
    // جدول contracts) را هم حذف می‌کند — سریع‌تر، بدون هیچ کوئری اضافه.
    const lastCharge = openCharges.sort(
      (a, b) => b.periodStart.getTime() - a.periodStart.getTime(),
    )[0];
    const monthlyRent = lastCharge?.netAmount ?? null;

    let status: DebtStatus = DebtStatus.CLEAN;
    if (
      monthlyRent &&
      monthlyRent.greaterThan(0) &&
      overdueDebt.greaterThan(0)
    ) {
      const monthsOverdue = overdueDebt.div(monthlyRent);
      if (monthsOverdue.greaterThan(6)) status = DebtStatus.CRITICAL;
      else if (monthsOverdue.greaterThan(3)) status = DebtStatus.HIGH;
      else if (monthsOverdue.greaterThan(1)) status = DebtStatus.MEDIUM;
      else status = DebtStatus.LOW;
    } else if (overdueDebt.greaterThan(0)) {
      status = DebtStatus.LOW;
    }

    await tx.rentDebt.upsert({
      where: { tenantId },
      create: {
        tenantId,
        totalDebt,
        overdueDebt,
        status,
        lastChargeAmount: lastCharge?.netAmount ?? 0,
        lastChargeDate: lastCharge?.periodStart ?? null,
      },
      update: {
        totalDebt,
        overdueDebt,
        status,
        ...(lastCharge
          ? {
              lastChargeAmount: lastCharge.netAmount,
              lastChargeDate: lastCharge.periodStart,
            }
          : {}),
      },
    });
  }

  // ==========================================================================
  // ثبت یک پرداخت (موتور داخلی — هم از createPayment عمومی، هم از ContractsService
  // برای پرداخت افتتاحیهٔ مهاجرت صدا زده می‌شود).
  // ==========================================================================
  async recordPayment(
    tx: Prisma.TransactionClient,
    actor: Actor,
    params: {
      contract: {
        id: string;
        marketId: string;
        tenantId: string;
        shopId: string;
        currencyId: string;
        securityDepositRemaining?: Prisma.Decimal | null;
      };
      amount: Prisma.Decimal;
      paymentDate: Date;
      paymentMethod: string;
      source: PaymentSourceType;
      accountId?: string | null;
      notes?: string | null;
      receiptNumber?: string | null;
      isOpeningEntry: boolean;
    },
  ) {
    let accountBalanceAfter: Prisma.Decimal | null = null;

    if (params.source === PaymentSourceType.SECURITY_DEPOSIT) {
      const remaining =
        params.contract.securityDepositRemaining ?? new Prisma.Decimal(0);
      if (params.amount.greaterThan(remaining)) {
        throw new ConflictException(
          'مبلغ امانت باقی‌مانده برای این برداشت کافی نیست',
        );
      }
      await tx.contract.update({
        where: { id: params.contract.id },
        data: { securityDepositRemaining: remaining.sub(params.amount) },
      });
    } else if (!params.isOpeningEntry) {
      if (!params.accountId)
        throw new BadRequestException('accountId الزامی است');
      const updatedAccount = await tx.account.update({
        where: { id: params.accountId },
        data: { balance: { increment: params.amount } },
      });
      accountBalanceAfter = updatedAccount.balance;
    }
    // isOpeningEntry=true با source=BANK: هیچ حسابی دست نمی‌خورد (پول قبلاً در گذشته دریافت شده).

    const { year, month } = toJalaliYearMonth(params.paymentDate);

    const payment = await tx.rentPayment.create({
      data: {
        marketId: params.contract.marketId,
        contractId: params.contract.id,
        tenantId: params.contract.tenantId,
        shopId: params.contract.shopId,
        month,
        year,
        amount: params.amount,
        currencyId: params.contract.currencyId,
        paymentDate: params.paymentDate,
        paymentMethod: params.paymentMethod as any,
        accountId:
          params.source === PaymentSourceType.SECURITY_DEPOSIT
            ? null
            : params.accountId,
        source: params.source,
        isOpeningEntry: params.isOpeningEntry,
        collectedById: actor.id,
        notes: params.notes ?? null,
        receiptNumber: params.receiptNumber ?? null,
      },
    });

    await this.allocateToCharges(
      tx,
      params.contract.id,
      payment.id,
      params.amount,
    );

    if (
      params.source === PaymentSourceType.BANK &&
      !params.isOpeningEntry &&
      params.accountId
    ) {
      await tx.ledgerEntry.create({
        data: {
          marketId: params.contract.marketId,
          accountId: params.accountId,
          currencyId: params.contract.currencyId,
          direction: 'IN',
          amount: params.amount,
          balanceAfter: accountBalanceAfter!,
          entryDate: params.paymentDate,
          description: 'دریافت کرایه',
          rentPaymentId: payment.id,
          createdById: actor.id,
        },
      });
    }

    await this.recomputeRentDebt(tx, params.contract.tenantId);

    return payment;
  }

  // ==========================================================================
  // API عمومی
  // ==========================================================================

  async createPayment(currentUser: { id: string }, dto: CreateRentPaymentDto) {
    const actor = await this.getActor(currentUser);
    const contract = await this.prisma.contract.findUnique({
      where: { id: dto.contractId },
    });
    if (!contract) throw new NotFoundException('قرارداد یافت نشد');
    this.ensureAccess(
      actor,
      contract.marketId,
      'دسترسی به این قرارداد مجاز نیست',
    );
    if (!contract.tenantId || !contract.shopId || !contract.currencyId) {
      throw new BadRequestException('قرارداد ناقص است');
    }

    const source = dto.source ?? PaymentSourceType.BANK;

    if (source === PaymentSourceType.BANK && dto.accountId) {
      const account = await this.prisma.account.findUnique({
        where: { id: dto.accountId },
      });
      if (!account) throw new NotFoundException('حساب یافت نشد');
      if (account.marketId !== contract.marketId) {
        throw new BadRequestException('حساب باید متعلق به همان بازار باشد');
      }
      if (account.currencyId !== contract.currencyId) {
        throw new BadRequestException('ارز حساب باید با ارز قرارداد یکی باشد');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      return this.recordPayment(tx, actor, {
        contract: {
          id: contract.id,
          marketId: contract.marketId,
          tenantId: contract.tenantId!,
          shopId: contract.shopId!,
          currencyId: contract.currencyId!,
          securityDepositRemaining: contract.securityDepositRemaining,
        },
        amount: new Prisma.Decimal(dto.amount),
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
        paymentMethod: dto.paymentMethod ?? 'cash',
        source,
        accountId: dto.accountId,
        notes: dto.notes,
        receiptNumber: dto.receiptNumber,
        isOpeningEntry: false,
      });
    });
  }

  // فهرست برج‌های افغانستان (حمل تا حوت) با شماره‌شان — تا فرانت مجبور نباشد این نام‌ها
  // را خودش دوباره تایپ کند؛ همیشه از همین یک منبع (AFGHAN_SOLAR_MONTHS) می‌خواند.
  getJalaliMonths() {
    return AFGHAN_SOLAR_MONTHS.slice(1).map((name, i) => ({ month: i + 1, name }));
  }

  async findAllCharges(currentUser: { id: string }, query: RentChargeQueryDto) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }
    const where: any = {
      ...(actor.role === 'SUPER_ADMIN' ? {} : { marketId: actor.marketId! }),
    };
    if (query.contractId !== undefined) where.contractId = query.contractId;
    if (query.tenantId !== undefined) where.tenantId = query.tenantId;
    if (query.shopId !== undefined) where.shopId = query.shopId;
    if (query.status !== undefined) where.status = query.status;
    if (query.periodEndFrom !== undefined || query.periodEndTo !== undefined) {
      where.periodEnd = {
        ...(query.periodEndFrom !== undefined ? { gte: new Date(query.periodEndFrom) } : {}),
        ...(query.periodEndTo !== undefined ? { lte: new Date(query.periodEndTo) } : {}),
      };
    }

    const orderBy = resolveSort(
      query.sortBy,
      query.sortOrder,
      ['periodStart', 'createdAt'] as const,
      {
        periodStart: 'desc',
      },
    );

    return paginate(this.prisma.rentCharges, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      include: {
        tenant: { select: { id: true, fullName: true } },
        shop: { select: { id: true, shopNumber: true } },
      },
    });
  }

  async findAllPayments(
    currentUser: { id: string },
    query: RentPaymentQueryDto,
  ) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }
    const where: any = {
      ...(actor.role === 'SUPER_ADMIN' ? {} : { marketId: actor.marketId! }),
    };
    if (query.contractId !== undefined) where.contractId = query.contractId;
    if (query.tenantId !== undefined) where.tenantId = query.tenantId;
    if (query.shopId !== undefined) where.shopId = query.shopId;

    const orderBy = resolveSort(
      query.sortBy,
      query.sortOrder,
      RentService.PAYMENT_SORT_FIELDS,
      { paymentDate: 'desc' },
    );

    return paginate(this.prisma.rentPayment, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      include: {
        tenant: { select: { id: true, fullName: true } },
        shop: { select: { id: true, shopNumber: true } },
        allocations: true,
      },
    });
  }

  async findRentDebt(currentUser: { id: string }, tenantId: string) {
    const actor = await this.getActor(currentUser);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('مستأجر یافت نشد');
    this.ensureAccess(actor, tenant.marketId, 'دسترسی به این مستأجر مجاز نیست');

    const debt = await this.prisma.rentDebt.findUnique({ where: { tenantId } });
    return (
      debt ?? {
        tenantId,
        totalDebt: new Prisma.Decimal(0),
        overdueDebt: new Prisma.Decimal(0),
        status: DebtStatus.CLEAN,
      }
    );
  }

  async findAllDebts(currentUser: { id: string }, query: RentDebtQueryDto) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }
    const where: any = {
      totalDebt: { gt: 0 },
      ...(actor.role === 'SUPER_ADMIN'
        ? {}
        : { tenant: { marketId: actor.marketId! } }),
    };
    if (query.status !== undefined) where.status = query.status;

    return paginate(this.prisma.rentDebt, {
      where,
      orderBy: { totalDebt: 'desc' },
      page: query.page,
      limit: query.limit,
      include: {
        tenant: { select: { id: true, fullName: true, marketId: true } },
      },
    });
  }

  // ==========================================================================
  // تخفیف/تغییر کرایه از وسط قرارداد — فقط فاکتورهای آیندهٔ هنوز پرداخت‌نشده
  // (PENDING/OVERDUE) با نرخ روزانهٔ جدید بازمحاسبه می‌شوند. ماه‌های PARTIAL/PAID
  // دست‌نخورده می‌مانند (گذشته تغییر نمی‌کند). Contract.rent هم دست‌نخورده می‌ماند —
  // این فقط روی فاکتورهای آینده اثر می‌گذارد، نه سند اصلی قرارداد.
  // ==========================================================================
  async adjustFutureRent(
    currentUser: { id: string },
    contractId: string,
    dto: { newRent: number; effectiveFrom: string; reason?: string },
  ) {
    const actor = await this.getActor(currentUser);
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
    });
    if (!contract) throw new NotFoundException('قرارداد یافت نشد');
    this.ensureAccess(
      actor,
      contract.marketId,
      'دسترسی به این قرارداد مجاز نیست',
    );
    if (contract.status !== 'active') {
      throw new ConflictException('فقط قرارداد فعال قابل تعدیل کرایه است');
    }

    const effectiveFrom = new Date(dto.effectiveFrom);
    const newRent = new Prisma.Decimal(dto.newRent);

    const adjustableCharges = await this.prisma.rentCharges.findMany({
      where: {
        contractId,
        periodStart: { gte: effectiveFrom },
        status: { in: [RentChargeStatus.PENDING, RentChargeStatus.OVERDUE] },
      },
      orderBy: { periodStart: 'asc' },
    });

    if (adjustableCharges.length === 0) {
      throw new BadRequestException(
        'هیچ فاکتور پرداخت‌نشده‌ای از این تاریخ به بعد یافت نشد تا تعدیل شود (تاریخ را با شروع یکی از دوره‌های فاکتور تطبیق دهید)',
      );
    }

    const note = `تعدیل کرایه از ${dto.effectiveFrom.slice(0, 10)}: ${contract.rent?.toString()} → ${newRent.toString()}${dto.reason ? ` — ${dto.reason}` : ''}`;

    return this.prisma.$transaction(async (tx) => {
      const updated: Prisma.RentChargesGetPayload<Record<string, never>>[] = [];

      for (const charge of adjustableCharges) {
        const newDailyRate = newRent.div(charge.days);
        const newNetAmount = newDailyRate.mul(charge.days);
        const newRemaining = Prisma.Decimal.max(
          0,
          newNetAmount.sub(charge.paidAmount),
        );

        const result = await tx.rentCharges.update({
          where: { id: charge.id },
          data: {
            dailyRate: newDailyRate,
            discountAmount: charge.grossAmount.sub(newNetAmount),
            netAmount: newNetAmount,
            remainingAmount: newRemaining,
            status: newRemaining.lessThanOrEqualTo(0)
              ? RentChargeStatus.PAID
              : charge.paidAmount.greaterThan(0)
                ? RentChargeStatus.PARTIAL
                : RentChargeStatus.PENDING,
            notes: charge.notes ? `${charge.notes}\n${note}` : note,
          },
        });
        updated.push(result);
      }

      if (contract.tenantId) {
        await this.recomputeRentDebt(tx, contract.tenantId);
      }

      return updated;
    });
  }

  // ==========================================================================
  // بخشیدنِ یک مبلغِ مشخص از بدهیِ موجودِ یک قرارداد — روی قدیمی‌ترین فاکتورهای باز
  // (PENDING/PARTIAL/OVERDUE) به همان ترتیبِ FIFOیی که allocateToCharges برای پرداخت
  // واقعی استفاده می‌کند، فقط این‌جا به‌جای paidAmount، discountAmount بالا می‌رود و هیچ
  // پولی/حساب/دفترداری‌ای دست نمی‌خورد. برخلاف adjustFutureRent، عمداً فاکتورهای PARTIAL
  // را هم شامل می‌شود — چون این یک بخششِ یک‌بارهٔ مبلغ است، نه تغییرِ نرخِ آینده.
  // ==========================================================================
  async discountDebt(
    currentUser: { id: string },
    contractId: string,
    dto: { amount: number; reason?: string },
  ) {
    const actor = await this.getActor(currentUser);
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
    });
    if (!contract) throw new NotFoundException('قرارداد یافت نشد');
    this.ensureAccess(
      actor,
      contract.marketId,
      'دسترسی به این قرارداد مجاز نیست',
    );
    if (!contract.tenantId) {
      throw new BadRequestException('قرارداد ناقص است');
    }

    const amount = new Prisma.Decimal(dto.amount);
    const note = `بخشش بدهی: ${amount.toString()}${dto.reason ? ` — ${dto.reason}` : ''}`;

    return this.prisma.$transaction(async (tx) => {
      const openCharges = await tx.rentCharges.findMany({
        where: { contractId, status: { in: OPEN_STATUSES } },
        orderBy: { periodStart: 'asc' },
      });

      const totalOutstanding = openCharges.reduce(
        (sum, c) => sum.add(c.remainingAmount),
        new Prisma.Decimal(0),
      );
      if (amount.greaterThan(totalOutstanding)) {
        throw new BadRequestException(
          `مبلغِ بخشش (${amount.toString()}) از مجموع بدهیِ بازِ این قرارداد (${totalOutstanding.toString()}) بیشتر است`,
        );
      }

      let remaining = amount;
      const affected: Prisma.RentChargesGetPayload<Record<string, never>>[] = [];

      for (const charge of openCharges) {
        if (remaining.isZero()) break;
        const applyAmount = Prisma.Decimal.min(remaining, charge.remainingAmount);

        const newNetAmount = charge.netAmount.sub(applyAmount);
        const newDiscountAmount = charge.discountAmount.add(applyAmount);
        const newRemaining = charge.remainingAmount.sub(applyAmount);

        const result = await tx.rentCharges.update({
          where: { id: charge.id },
          data: {
            discountAmount: newDiscountAmount,
            netAmount: newNetAmount,
            remainingAmount: newRemaining,
            status: newRemaining.lessThanOrEqualTo(0)
              ? RentChargeStatus.PAID
              : charge.paidAmount.greaterThan(0)
                ? RentChargeStatus.PARTIAL
                : RentChargeStatus.PENDING,
            notes: charge.notes ? `${charge.notes}\n${note}` : note,
          },
        });
        affected.push(result);
        remaining = remaining.sub(applyAmount);
      }

      await this.recomputeRentDebt(tx, contract.tenantId!);

      return {
        contractId,
        totalDiscounted: amount.toString(),
        affectedCharges: affected,
      };
    });
  }

  // هر شب: فاکتورهای PENDING که periodEnd‌شان گذشته را OVERDUE می‌کند. پولی جابه‌جا نمی‌شود.
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async flagOverdueCharges() {
    await this.prisma.rentCharges.updateMany({
      where: {
        status: RentChargeStatus.PENDING,
        periodEnd: { lt: new Date() },
      },
      data: { status: RentChargeStatus.OVERDUE },
    });
  }
}
