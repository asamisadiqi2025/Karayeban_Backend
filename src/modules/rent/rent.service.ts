import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
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
import { CreateRentPaymentsBulkDto } from './dto/create-rent-payments-bulk.dto';
import { buildRentDebtView, summarizeRentDebt } from './rent-debt-summary';
import { RentChargeQueryDto } from './dto/rent-charge-query.dto';
import { RentPaymentQueryDto } from './dto/rent-payment-query.dto';
import { RentDebtQueryDto } from './dto/rent-debt-query.dto';
import { RentDebtAgingQueryDto } from './dto/rent-debt-aging-query.dto';
import { AuditLogService } from '../../common/audit-log/audit-log.service';
import { RequestMeta } from '../../common/audit-log/request-meta.util';
import { resolveRateToBase } from '../../common/utils/resolve-rate-to-base';
import { assertPaymentDateNotInFuture } from '../../common/utils/assert-payment-date';
import {
  assertReceiptNumberFree,
  normalizeReceiptNumber,
} from '../../common/utils/receipt-number';
import {
  hashRequest,
  itemIdempotencyKey,
  runIdempotent,
} from '../../common/idempotency/idempotency';

const NO_REQUEST_META: RequestMeta = { ip: null, userAgent: null };

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

  private ensureAccess(actor: Actor, entityMarketId: string, message: string) {
    if (actor.role === 'SUPER_ADMIN') return;
    if (actor.marketId !== entityMarketId) {
      throw new ForbiddenException(message);
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
  // فقط فاکتورهایی که periodStart شان رسیده حساب می‌شوند (همان تعریفِ totalDebt در
  // recomputeRentDebt) — وگرنه تسویهٔ یک قراردادِ هنوز‌فعال (بدون فسخِ قبلی) کل کرایهٔ
  // باقی‌ماندهٔ تا آخر قرارداد را هم طلب می‌کرد، نه فقط چیزی که واقعاً تا امروز سررسید شده.
  async getOpenDebtForContract(
    tx: Prisma.TransactionClient,
    contractId: string,
  ): Promise<Prisma.Decimal> {
    const now = new Date();
    const openCharges = await tx.rentCharges.findMany({
      where: {
        contractId,
        status: { in: OPEN_STATUSES },
        periodStart: { lte: now },
      },
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

    // کرایه به ارزِ قرارداد است و یک مستأجر می‌تواند قراردادهایی به ارزهای مختلف داشته باشد؛ ارزهای
    // مختلف هرگز در یک عدد جمع نمی‌شوند، پس بدهی «به‌ازای هر ارز» یک ردیف دارد (RentDebt: tenantId + currencyId).
    const chargesByCurrency = new Map<string, typeof openCharges>();
    for (const charge of openCharges) {
      const list = chargesByCurrency.get(charge.currencyId) ?? [];
      list.push(charge);
      chargesByCurrency.set(charge.currencyId, list);
    }

    const now = new Date();
    for (const [currencyId, charges] of chargesByCurrency) {
      // تعریفِ totalDebt/overdueDebt/status در summarizeRentDebt (خالص و تست‌شده) آمده است.
      const { totalDebt, overdueDebt, status, lastCharge } = summarizeRentDebt(charges, now);

      await tx.rentDebt.upsert({
        where: { tenantId_currencyId: { tenantId, currencyId } },
        create: {
          tenantId,
          currencyId,
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

    // ارزهایی که دیگر فاکتورِ بازی ندارند: بدهی صفر و CLEAN. ردیف حذف نمی‌شود تا فیلدهای دستیِ
    // notes/riskScore بماند (همان رفتارِ قبلی برای مستأجری که همهٔ بدهی‌اش را پرداخته).
    await tx.rentDebt.updateMany({
      where: { tenantId, currencyId: { notIn: [...chargesByCurrency.keys()] } },
      data: { totalDebt: 0, overdueDebt: 0, status: DebtStatus.CLEAN },
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
      exchangeRate?: number | null;
    },
    meta: RequestMeta = NO_REQUEST_META,
  ) {
    // قواعدِ مشترکِ «همهٔ» مسیرهای ثبتِ پرداختِ کرایه (پرداخت عادی، bulk، پرداختِ ترکیبیِ قرارداد، تسویه):
    // ۱) تاریخِ پرداخت آینده نباشد؛ ۲) شمارهٔ رسیدِ پرداخت‌های زنده تکراری نباشد. هر دو قبل از هر نوشتن.
    assertPaymentDateNotInFuture(params.paymentDate);
    const receiptNumber = normalizeReceiptNumber(params.receiptNumber);
    if (receiptNumber && !params.isOpeningEntry) {
      await assertReceiptNumberFree(tx, {
        kind: 'rent',
        marketId: params.contract.marketId,
        receiptNumber,
      });
    }

    let accountBalanceAfter: Prisma.Decimal | null = null;

    const rate = await resolveRateToBase(tx, {
      marketId: params.contract.marketId,
      currencyId: params.contract.currencyId,
      date: params.paymentDate,
      amount: params.amount,
      manualRate: params.exchangeRate,
    });

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
        exchangeRate: rate.exchangeRate,
        baseCurrencyAmount: rate.baseCurrencyAmount,
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
        receiptNumber,
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
          exchangeRate: rate.exchangeRate,
          baseCurrencyAmount: rate.baseCurrencyAmount,
          entryDate: params.paymentDate,
          description: 'دریافت کرایه',
          rentPaymentId: payment.id,
          createdById: actor.id,
        },
      });
    }

    await this.recomputeRentDebt(tx, params.contract.tenantId);

    await this.auditLog.record({
      tx,
      action: 'CREATE',
      entityType: 'RentPayment',
      entityId: payment.id,
      marketId: params.contract.marketId,
      userId: actor.id,
      newData: payment,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return payment;
  }

  // ==========================================================================
  // API عمومی
  // ==========================================================================

  // idempotencyKey (هدر Idempotency-Key): اگر بیاید، تلاشِ دوبارهٔ همان درخواست پرداختِ دوم نمی‌سازد و
  // همان پاسخِ قبلی را برمی‌گرداند (ن.ک. common/idempotency). نیاید = رفتارِ قبلی.
  async createPayment(
    currentUser: { id: string },
    dto: CreateRentPaymentDto,
    meta: RequestMeta,
    idempotencyKey?: string,
  ) {
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

    return runIdempotent(this.prisma, {
      userId: actor.id,
      scope: 'RENT_PAYMENT',
      key: idempotencyKey,
      requestHash: hashRequest(dto),
      work: (tx) =>
        this.recordPayment(
          tx,
          actor,
          {
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
            exchangeRate: dto.exchangeRate,
          },
          meta,
        ),
    });
  }

  // چند پرداختِ کرایه یک‌جا (حداکثر ۱۰) — همان الگوی ElectricityService.createPaymentsBulk: هر آیتم با
  // createPaymentِ خودش (تراکنشِ مستقل) پردازش می‌شود، پس خطای یکی بقیه را متوقف نمی‌کند و حسابدار فقط
  // همان را در failed می‌بیند. آیتم‌ها «پشت‌سرهم» (نه موازی) اجرا می‌شوند تا دو پرداخت برای یک قرارداد
  // تخصیصِ FIFO را از هم عقب نیندازند.
  //
  // دو تفاوتِ عمدی با نسخهٔ برق: (۱) شمارهٔ رسیدِ تکراری «داخل همین درخواست» رد می‌شود (جلوگیری از
  // ثبتِ دوبارهٔ یک رسید)؛ (۲) متنِ خطا فقط برای خطاهای تجاری (HttpException) به کلاینت می‌رود — خطای
  // غیرمنتظره (مثلاً خطای دیتابیس) فقط لاگ می‌شود و جزئیاتش نشت نمی‌کند.
  async createPaymentsBulk(
    currentUser: { id: string },
    dto: CreateRentPaymentsBulkDto,
    meta: RequestMeta = NO_REQUEST_META,
    idempotencyKey?: string,
  ) {
    const created: Awaited<ReturnType<RentService['createPayment']>>[] = [];
    const failed: { index: number; error: string }[] = [];
    const usedReceipts = new Set<string>();

    for (let i = 0; i < dto.payments.length; i++) {
      const item = dto.payments[i];
      const receipt = item.receiptNumber?.trim();
      if (receipt && usedReceipts.has(receipt)) {
        failed.push({
          index: i,
          error: `شمارهٔ رسید «${receipt}» در همین درخواست تکراری است`,
        });
        continue;
      }

      try {
        // کلیدِ هر آیتم از کلیدِ درخواست + شمارهٔ آیتم ساخته می‌شود: تلاشِ دوبارهٔ کلِ درخواست فقط
        // آیتم‌های انجام‌نشده را انجام می‌دهد و بقیه را از ثبتِ قبلی بازپخش می‌کند.
        created.push(
          await this.createPayment(currentUser, item, meta, itemIdempotencyKey(idempotencyKey, i)),
        );
        // فقط بعد از موفقیت ثبت می‌شود: اگر آیتمِ اول خطا داشت، اصلاحِ همان رسید در آیتمِ بعدی مجاز است.
        if (receipt) usedReceipts.add(receipt);
      } catch (e) {
        if (!(e instanceof HttpException)) {
          new Logger(RentService.name).error(
            `bulk rent payment #${i} failed unexpectedly`,
            e instanceof Error ? e.stack : String(e),
          );
        }
        failed.push({
          index: i,
          error: e instanceof HttpException ? e.message : 'خطای ناشناخته',
        });
      }
    }

    return { created, failed };
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

  // بازسازیِ کاملِ کشِ بدهیِ کرایه برای «همهٔ» مستأجرها (idempotent). RentDebt یک کشِ مشتق از rent_charges
  // است و فقط با رویدادها (پرداخت/فاکتور/فسخ) به‌روز می‌شود؛ این متد برای ابزارِ عملیاتی
  // (npm run rent-debts:rebuild) و بعد از مهاجرت‌ها/ترمیمِ داده است، نه یک endpoint. هر مستأجر با
  // تراکنشِ مستقلِ خودش بازسازی می‌شود (خطای یکی بقیه را متوقف نمی‌کند).
  async rebuildAllRentDebts(): Promise<{ tenants: number; failed: string[] }> {
    const [withOpen, withRow] = await Promise.all([
      this.prisma.rentCharges.findMany({
        where: { status: { in: OPEN_STATUSES } },
        select: { tenantId: true },
        distinct: ['tenantId'],
      }),
      this.prisma.rentDebt.findMany({
        select: { tenantId: true },
        distinct: ['tenantId'],
      }),
    ]);
    // مستأجرِ دارای فاکتورِ باز (باید ردیف داشته باشد) ∪ مستأجرِ دارای ردیف (شاید کهنه و باید صفر شود).
    const tenantIds = [...new Set([...withOpen, ...withRow].map((r) => r.tenantId))];

    const failed: string[] = [];
    for (const tenantId of tenantIds) {
      try {
        await this.prisma.$transaction((tx) => this.recomputeRentDebt(tx, tenantId));
      } catch {
        failed.push(tenantId);
      }
    }
    return { tenants: tenantIds.length, failed };
  }

  async findRentDebt(currentUser: { id: string }, tenantId: string) {
    const actor = await this.getActor(currentUser);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('مستأجر یافت نشد');
    this.ensureAccess(actor, tenant.marketId, 'دسترسی به این مستأجر مجاز نیست');

    // به‌ازای هر ارز یک ردیف؛ شکلِ پاسخ (تک‌ارزی سازگار با قبل، چندارزی با byCurrency) در buildRentDebtView.
    const rows = await this.prisma.rentDebt.findMany({
      where: { tenantId },
      include: { currency: { select: { id: true, code: true } } },
    });
    return buildRentDebtView(tenantId, rows);
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
    // هر ردیف = یک مستأجر در یک ارز؛ مرتب‌سازیِ totalDebt فقط داخلِ یک ارز معنی دارد، پس برای فهرستِ
    // دقیق currencyId بدهید.
    if (query.currencyId !== undefined) where.currencyId = query.currencyId;

    return paginate(this.prisma.rentDebt, {
      where,
      orderBy: { totalDebt: 'desc' },
      page: query.page,
      limit: query.limit,
      include: {
        tenant: { select: { id: true, fullName: true, marketId: true } },
        currency: { select: { id: true, code: true } },
      },
    });
  }

  private static readonly AGING_BUCKETS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'] as const;

  private static bucketForPeriodEnd(periodEnd: Date, now: Date): (typeof RentService.AGING_BUCKETS)[number] {
    if (periodEnd >= now) return 'current';
    const daysOverdue = Math.floor((now.getTime() - periodEnd.getTime()) / (1000 * 60 * 60 * 24));
    if (daysOverdue <= 30) return 'd1_30';
    if (daysOverdue <= 60) return 'd31_60';
    if (daysOverdue <= 90) return 'd61_90';
    return 'd90_plus';
  }

  // رده‌بندیِ سنیِ بدهیِ باز کرایه — این گزارش مکملِ findAllDebts است، نه جایگزینش:
  // findAllDebts می‌گوید «کدام مستأجر چقدر بدهکار است»، این می‌گوید «بدهیِ کل بازار از نظرِ
  // قدمت چطور پخش شده» (چند درصدش تازه است، چند درصدش بیش از ۹۰ روز مانده). چون Prisma
  // نمی‌تواند «امروز منهای periodEnd» را در سطحِ groupBy خودش دسته‌بندی کند، فاکتورهای بازِ
  // این بازار خوانده و در همین سرویس دسته‌بندی می‌شوند — دقیقاً همان استثنایی که
  // InventoryService.getItemsSummary هم برای qty×averageCost دارد؛ امن است چون تعدادِ
  // فاکتورهای بازِ یک بازار همیشه محدود است (نه کلِ تاریخچهٔ تراکنش‌ها).
  async getDebtAging(currentUser: { id: string }, query: RentDebtAgingQueryDto) {
    const actor = await this.getActor(currentUser);
    const marketId = this.resolveMarketId(actor, query.marketId);

    const openCharges = await this.prisma.rentCharges.findMany({
      where: { marketId, status: { in: OPEN_STATUSES }, remainingAmount: { gt: 0 } },
      select: { remainingAmount: true, currencyId: true, periodEnd: true },
    });

    const currencyIds = [...new Set(openCharges.map((c) => c.currencyId))];
    const currencies = currencyIds.length
      ? await this.prisma.currency.findMany({
          where: { id: { in: currencyIds } },
          select: { id: true, code: true },
        })
      : [];
    const currencyCodeById = new Map(currencies.map((c) => [c.id, c.code]));

    const now = new Date();
    const zero = new Prisma.Decimal(0);
    const zeroBuckets = () =>
      Object.fromEntries(
        RentService.AGING_BUCKETS.map((b) => [b, { amount: zero, count: 0 }]),
      ) as Record<(typeof RentService.AGING_BUCKETS)[number], { amount: Prisma.Decimal; count: number }>;

    const byCurrency = new Map<
      string,
      { currencyId: string; currencyCode: string | null; buckets: ReturnType<typeof zeroBuckets>; totalAmount: Prisma.Decimal; totalCount: number }
    >();

    for (const charge of openCharges) {
      const bucket = RentService.bucketForPeriodEnd(charge.periodEnd, now);
      const entry = byCurrency.get(charge.currencyId) ?? {
        currencyId: charge.currencyId,
        currencyCode: currencyCodeById.get(charge.currencyId) ?? null,
        buckets: zeroBuckets(),
        totalAmount: zero,
        totalCount: 0,
      };
      entry.buckets[bucket].amount = entry.buckets[bucket].amount.add(charge.remainingAmount);
      entry.buckets[bucket].count += 1;
      entry.totalAmount = entry.totalAmount.add(charge.remainingAmount);
      entry.totalCount += 1;
      byCurrency.set(charge.currencyId, entry);
    }

    return {
      marketId,
      asOf: now.toISOString(),
      byCurrency: [...byCurrency.values()],
    };
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
    meta: RequestMeta = NO_REQUEST_META,
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

      await this.auditLog.record({
        tx,
        action: 'UPDATE',
        entityType: 'Contract',
        entityId: contractId,
        marketId: contract.marketId,
        userId: actor.id,
        oldData: { rent: contract.rent, effectiveFrom: dto.effectiveFrom },
        newData: { newRent: dto.newRent, reason: dto.reason ?? null, affectedCharges: updated },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

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
    meta: RequestMeta = NO_REQUEST_META,
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

      await this.auditLog.record({
        tx,
        action: 'UPDATE',
        entityType: 'Contract',
        entityId: contractId,
        marketId: contract.marketId,
        userId: actor.id,
        newData: {
          totalDiscounted: amount.toString(),
          reason: dto.reason ?? null,
          affectedCharges: affected,
        },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

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
