import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  ContractStatus,
  MeterStatus,
  Prisma,
  PaymentSourceType,
  RentChargeStatus,
  SettlementMethod,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RentService } from '../rent/rent.service';
import {
  ElectricityService,
  ELECTRICITY_OPEN_STATUSES,
} from '../electricity/electricity.service';
import { ensureMarketSetupComplete } from '../../common/utils/ensure-market-setup-complete';
import { ensureCurrencyEnabledForMarket } from '../../common/utils/ensure-currency-enabled-for-market';
import { resolveRateToBase } from '../../common/utils/resolve-rate-to-base';
import {
  paginate,
  resolveSort,
  buildSearchWhere,
} from '../../common/utils/pagination';
import { CreateContractDto } from './dto/create-contract.dto';
import { assertSecurityDepositIntent } from './security-deposit-intent';
import { UpdateContractDto } from './dto/update-contract.dto';
import { ContractQueryDto } from './dto/contract-query.dto';
import { TerminateContractDto } from './dto/terminate-contract.dto';
import { SettleContractDto } from './dto/settle-contract.dto';
import { CancelContractDto } from './dto/cancel-contract.dto';
import { RenewContractDto } from './dto/renew-contract.dto';
import { PayContractDebtDto } from './dto/pay-contract-debt.dto';
import { PayFromDepositDto } from './dto/pay-from-deposit.dto';
import { RefundDepositDto } from './dto/refund-deposit.dto';
import { ContractExpiryForecastQueryDto } from './dto/contract-expiry-forecast-query.dto';
import { AuditLogService } from '../../common/audit-log/audit-log.service';
import { RequestMeta } from '../../common/audit-log/request-meta.util';
import { hashRequest, runIdempotent } from '../../common/idempotency/idempotency';
import { acquireAdvisoryXactLock } from '../../common/utils/advisory-lock';
import { assertPaymentDateNotInFuture } from '../../common/utils/assert-payment-date';

const NO_REQUEST_META: RequestMeta = { ip: null, userAgent: null };

type Actor = { id: string; role: string; marketId: string | null };

const OPEN_STATUSES: RentChargeStatus[] = [
  RentChargeStatus.PENDING,
  RentChargeStatus.PARTIAL,
  RentChargeStatus.OVERDUE,
];

@Injectable()
export class ContractsService {
  private static readonly SORT_FIELDS = [
    'startDate',
    'endDate',
    'createdAt',
  ] as const;
  private static readonly SEARCH_FIELDS = [
    'tenant.fullName',
    'shop.shopNumber',
  ] as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rentService: RentService,
    private readonly electricityService: ElectricityService,
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

  private resolveMarketId(
    actor: Actor,
    providedMarketId: string | undefined,
  ): string {
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
    const contract = await this.prisma.contract.findUnique({ where: { id } });
    if (!contract) throw new NotFoundException('قرارداد یافت نشد');
    return contract;
  }

  // ==========================================================================
  // بدهیِ باز + محافظِ «اول تسویه، بعد فسخ/تمدید/برگشتِ امانت»
  // ==========================================================================

  // بدهیِ بازِ یک قرارداد: کرایهٔ همین قرارداد + برقِ همین مستأجر/دوکان (به تفکیکِ ارز).
  //  rentScope='all': همهٔ فاکتورهای بازِ کرایه (بعد از فسخ فاکتورهای آینده لغو شده‌اند، پس همین «بدهیِ واقعی» است)؛
  //  rentScope='due': فقط فاکتورهایی که periodStart‌شان رسیده (برای تمدیدِ قراردادِ هنوز‌جاری — کرایهٔ ماه‌های بعد هنوز بدهی نیست).
  private async getOutstandingDebt(
    tx: Prisma.TransactionClient,
    contract: { id: string; tenantId: string | null; shopId: string | null },
    rentScope: 'all' | 'due',
  ) {
    const rent = await tx.rentCharges.aggregate({
      where: {
        contractId: contract.id,
        status: { in: OPEN_STATUSES },
        ...(rentScope === 'due' ? { periodStart: { lte: new Date() } } : {}),
      },
      _sum: { remainingAmount: true },
    });
    const electricity =
      contract.tenantId && contract.shopId
        ? await this.electricityService.getOpenDebtByCurrencyForShop(
            tx,
            contract.tenantId,
            contract.shopId,
          )
        : [];
    const rentAmount = rent._sum.remainingAmount ?? new Prisma.Decimal(0);
    return {
      rent: rentAmount,
      electricity,
      hasDebt: rentAmount.greaterThan(0) || electricity.length > 0,
    };
  }

  // خطای ۴۰۹ با متنِ فارسیِ روشن (چقدر کرایه، چقدر برق، چقدر امانت داریم و کجا تسویه کنید) + همان اعداد به‌صورت
  // ساختاریافته در details (فرانت بدونِ پارسِ متن نشان بدهد).
  private async buildDebtError(
    tx: Prisma.TransactionClient,
    contract: { id: string; currencyId: string | null; securityDepositRemaining: Prisma.Decimal | null },
    debt: { rent: Prisma.Decimal; electricity: { currencyId: string; amount: Prisma.Decimal; billsCount: number }[] },
    action: 'terminate' | 'renew' | 'refund-deposit',
  ) {
    const ids = [contract.currencyId, ...debt.electricity.map((e) => e.currencyId)].filter(
      (v): v is string => !!v,
    );
    const currencies = ids.length
      ? await tx.currency.findMany({ where: { id: { in: ids } }, select: { id: true, code: true } })
      : [];
    const code = (id: string | null) => currencies.find((c) => c.id === id)?.code ?? '';

    const deposit = contract.securityDepositRemaining ?? new Prisma.Decimal(0);
    const parts: string[] = [];
    if (debt.rent.greaterThan(0)) parts.push(`کرایه ${debt.rent.toString()} ${code(contract.currencyId)}`.trim());
    for (const e of debt.electricity) parts.push(`برق ${e.amount.toString()} ${code(e.currencyId)}`.trim());

    const verb = { terminate: 'فسخ', renew: 'تمدید', 'refund-deposit': 'برگرداندنِ امانتِ' }[action];
    const message =
      `${verb} قرارداد ممکن نیست: مستأجر بدهیِ باز دارد (${parts.join('، ')}). اول حساب‌ها را تسویه کنید — ` +
      `از امانت (باقی‌مانده ${deposit.toString()} ${code(contract.currencyId)}): POST /contracts/${contract.id}/pay-from-deposit ، ` +
      `یا نقد از خودِ مستأجر: POST /contracts/${contract.id}/pay-debt`;

    return new ConflictException({
      message,
      details: {
        code: 'OUTSTANDING_DEBT',
        action,
        rentDebt: debt.rent.toString(),
        rentCurrency: { id: contract.currencyId, code: code(contract.currencyId) },
        electricityDebt: debt.electricity.map((e) => ({
          currencyId: e.currencyId,
          currencyCode: code(e.currencyId),
          amount: e.amount.toString(),
          billsCount: e.billsCount,
        })),
        depositRemaining: deposit.toString(),
      },
    });
  }

  // ==========================================================================
  // ساخت قرارداد — هم برای دوکان خالیِ تازه‌اجاره‌شده، هم برای مهاجرت قراردادی که از
  // قبل (مثلاً ۵ ماه) در حال جریان است. تفاوتشان فقط startDate و openingRentPaid است؛
  // بقیهٔ منطق (تولید فاکتور، FIFO) دقیقاً یکسان است.
  // ==========================================================================
  async create(
    currentUser: { id: string },
    dto: CreateContractDto,
    meta: RequestMeta = NO_REQUEST_META,
  ) {
    const actor = await this.getActor(currentUser);
    const marketId = this.resolveMarketId(actor, dto.marketId);

    await ensureMarketSetupComplete(this.prisma, marketId);

    const shop = await this.prisma.shop.findUnique({
      where: { id: dto.shopId },
    });
    if (!shop) throw new NotFoundException('دوکان یافت نشد');
    if (shop.marketId !== marketId) {
      throw new BadRequestException('دوکان باید متعلق به همان بازار باشد');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
    });
    if (!tenant) throw new NotFoundException('مستأجر یافت نشد');
    if (tenant.marketId !== marketId) {
      throw new BadRequestException('مستأجر باید متعلق به همان بازار باشد');
    }

    if (dto.guarantorId) {
      const guarantor = await this.prisma.guarantor.findUnique({
        where: { id: dto.guarantorId },
      });
      if (!guarantor) throw new NotFoundException('ضامن یافت نشد');
      if (guarantor.marketId !== marketId) {
        throw new BadRequestException('ضامن باید متعلق به همان بازار باشد');
      }
    }

    const currency = await this.prisma.currency.findUnique({
      where: { id: dto.currencyId },
    });
    if (!currency) throw new NotFoundException('ارز مورد نظر یافت نشد');
    await ensureCurrencyEnabledForMarket(this.prisma, marketId, dto.currencyId);

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate <= startDate) {
      throw new BadRequestException('تاریخ پایان باید بعد از تاریخ شروع باشد');
    }

    // قراردادِ قدیمی (شروع‌شده در گذشته) + امانت: «قبلاً گرفته شده» یا «همین الان» باید صریح باشد،
    // وگرنه امانتِ قدیمی بی‌صدا به‌عنوان پولِ نو به حساب اضافه می‌شود (دوبار شمرده شدن).
    assertSecurityDepositIntent({
      startDate,
      securityDeposit: dto.securityDeposit,
      isOpeningEntry: dto.securityDepositIsOpeningEntry,
      accountId: dto.securityDepositAccountId,
      exchangeRate: dto.securityDepositExchangeRate,
    });

    let securityDepositAccount: {
      id: string;
      marketId: string;
      currencyId: string;
    } | null = null;
    if (dto.securityDeposit && !dto.securityDepositIsOpeningEntry) {
      if (!dto.securityDepositAccountId) {
        throw new BadRequestException('securityDepositAccountId الزامی است');
      }
      const account = await this.prisma.account.findUnique({
        where: { id: dto.securityDepositAccountId },
      });
      if (!account) throw new NotFoundException('حساب امانت یافت نشد');
      if (account.marketId !== marketId) {
        throw new BadRequestException(
          'حساب امانت باید متعلق به همان بازار باشد',
        );
      }
      if (account.currencyId !== dto.currencyId) {
        throw new BadRequestException(
          'ارز حساب امانت باید با ارز قرارداد یکی باشد',
        );
      }
      securityDepositAccount = account;
    }

    // نقطهٔ صفرِ تازه برای کنتورِ این دوکان — برای مستأجری که وسطِ یک دورهٔ میترخوانی
    // می‌آید (مثلاً دوکان چند روز/هفته خالی بوده). اگر ندهید، همه‌چیز مثل قبل است.
    let meterCheckpoint: { id: string; reading: Prisma.Decimal } | null = null;
    if (dto.meterId) {
      const meter = await this.prisma.electricityMeter.findUnique({
        where: { id: dto.meterId },
      });
      if (!meter) throw new NotFoundException('کنتور یافت نشد');
      if (meter.marketId !== marketId) {
        throw new BadRequestException('کنتور باید متعلق به همان بازار باشد');
      }
      if (meter.shopId && meter.shopId !== dto.shopId) {
        throw new BadRequestException(
          'این کنتور به دوکان دیگری متصل است — اول با PATCH /meters/:id آن را به این دوکان منتقل کنید',
        );
      }
      const reading = new Prisma.Decimal(dto.meterReadingOnStart!);
      if (meter.lastReading && reading.lessThan(meter.lastReading)) {
        throw new BadRequestException(
          `درجهٔ واردشده (${reading.toString()}) نمی‌تواند از آخرین درجهٔ ثبت‌شدهٔ کنتور (${meter.lastReading.toString()}) کمتر باشد — اگر کنتور تعویض شده، اول از merge کنتور استفاده کنید`,
        );
      }
      meterCheckpoint = { id: meter.id, reading };
    }

    const rent = new Prisma.Decimal(dto.rent);
    const now = new Date();
    const isStarted = startDate <= now;

    return this.prisma.$transaction(async (tx) => {
      const activeOnShop = await tx.contract.findFirst({
        where: {
          shopId: dto.shopId,
          status: { in: [ContractStatus.active, ContractStatus.suspended] },
        },
      });
      if (activeOnShop) {
        throw new ConflictException('این دوکان از قبل یک قرارداد فعال دارد');
      }

      const depositRate = securityDepositAccount
        ? await resolveRateToBase(tx, {
            marketId,
            currencyId: dto.currencyId,
            date: now,
            amount: new Prisma.Decimal(dto.securityDeposit!),
            manualRate: dto.securityDepositExchangeRate,
          })
        : null;

      const contract = await tx.contract.create({
        data: {
          marketId,
          shopId: dto.shopId,
          tenantId: dto.tenantId,
          guarantorId: dto.guarantorId ?? null,
          startDate,
          endDate,
          rent,
          currencyId: dto.currencyId,
          notes: dto.notes?.trim() || null,
          status: isStarted ? ContractStatus.active : ContractStatus.draft,
          securityDeposit: dto.securityDeposit ?? 0,
          securityDepositRemaining: dto.securityDeposit ?? 0,
          securityDepositAccountId: securityDepositAccount?.id ?? null,
          securityDepositExchangeRate: depositRate?.exchangeRate ?? null,
          securityDepositBaseCurrencyAmount: depositRate?.baseCurrencyAmount ?? null,
        },
      });

      await this.rentService.generateChargesForContract(tx, {
        id: contract.id,
        marketId,
        shopId: dto.shopId,
        tenantId: dto.tenantId,
        startDate,
        endDate,
        rent,
        currencyId: dto.currencyId,
      });

      // بدون این، تا اولین پرداخت/تعدیل، RentDebt اصلاً ساخته نمی‌شود و GET /rent/debts
      // یک صفرِ ساختگی (پیش‌فرضِ نبودِ رکورد) برمی‌گرداند — در حالی‌که فاکتورهای واقعی همین
      // الان ساخته شده‌اند.
      await this.rentService.recomputeRentDebt(tx, dto.tenantId);

      await tx.shop.update({
        where: { id: dto.shopId },
        data: {
          status: isStarted ? 'rented' : 'pending',
          currentContractId: contract.id,
          currentTenantId: dto.tenantId,
        },
      });

      if (meterCheckpoint) {
        // اگر کنتور موقع خالی‌بودنِ دوکان inactive شده بود، همین‌جا که مستأجرِ جدید واقعاً
        // وصل می‌شود دوباره active می‌شود — وگرنه این هم مثل خودِ lastReading یک قدمِ
        // دستیِ جداگانه و فراموش‌شدنی می‌ماند.
        await tx.electricityMeter.update({
          where: { id: meterCheckpoint.id },
          data: {
            shopId: dto.shopId,
            status: MeterStatus.active,
            lastReading: meterCheckpoint.reading,
            lastReadingDate: startDate,
          },
        });
      }

      if (securityDepositAccount) {
        const depositAmount = new Prisma.Decimal(dto.securityDeposit!);
        const updatedAccount = await tx.account.update({
          where: { id: securityDepositAccount.id },
          data: { balance: { increment: depositAmount } },
        });
        await tx.ledgerEntry.create({
          data: {
            marketId,
            accountId: securityDepositAccount.id,
            currencyId: dto.currencyId,
            direction: 'IN',
            amount: depositAmount,
            balanceAfter: updatedAccount.balance,
            exchangeRate: depositRate?.exchangeRate ?? null,
            baseCurrencyAmount: depositRate?.baseCurrencyAmount ?? null,
            entryDate: now,
            description: `امانت (پیش‌پرداخت) قرارداد دوکان «${shop.shopNumber}»`,
            createdById: actor.id,
          },
        });
      }

      if (dto.openingRentPaid) {
        await this.rentService.recordPayment(
          tx,
          actor,
          {
            contract: {
              id: contract.id,
              marketId,
              tenantId: dto.tenantId,
              shopId: dto.shopId,
              currencyId: dto.currencyId,
              securityDepositRemaining: contract.securityDepositRemaining,
            },
            amount: new Prisma.Decimal(dto.openingRentPaid),
            paymentDate: now,
            paymentMethod: 'cash',
            source: PaymentSourceType.BANK,
            isOpeningEntry: true,
            notes: 'پرداخت‌های کرایه قبل از راه‌اندازی سیستم',
          },
          meta,
        );
      }

      const finalContract = await tx.contract.findUniqueOrThrow({
        where: { id: contract.id },
      });

      await this.auditLog.record({
        tx,
        action: 'CREATE',
        entityType: 'Contract',
        entityId: contract.id,
        marketId,
        userId: actor.id,
        newData: finalContract,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return finalContract;
    });
  }

  async findAll(currentUser: { id: string }, query: ContractQueryDto) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }
    const where: any = {
      ...(actor.role === 'SUPER_ADMIN' ? {} : { marketId: actor.marketId! }),
    };
    if (query.shopId !== undefined) where.shopId = query.shopId;
    if (query.tenantId !== undefined) where.tenantId = query.tenantId;
    if (query.status !== undefined) where.status = query.status;

    const searchWhere = buildSearchWhere(
      ContractsService.SEARCH_FIELDS,
      query.search,
    );
    if (searchWhere) where.AND = [searchWhere];

    const orderBy = resolveSort(
      query.sortBy,
      query.sortOrder,
      ContractsService.SORT_FIELDS,
      {
        createdAt: 'desc',
      },
    );

    return paginate(this.prisma.contract, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      include: {
        shop: { select: { id: true, shopNumber: true } },
        tenant: { select: { id: true, fullName: true } },
      },
    });
  }

  // قراردادهای فعالی که در withinDays روزِ آینده منقضی می‌شوند — برای برنامه‌ریزیِ تمدید.
  // فقط status=active بررسی می‌شود، نه draft/suspended (چون هنوز شروع نشده یا موقتاً
  // متوقف است) و نه early_terminated/expired/cancelled (چون از قبل تمام شده‌اند) — این‌ها
  // «قراردادهایی که همین الان دارند اجاره می‌کِشند و به‌زودی سررسیدشان می‌رسد» را می‌خواهد.
  async getExpiryForecast(
    currentUser: { id: string },
    query: ContractExpiryForecastQueryDto,
  ) {
    const actor = await this.getActor(currentUser);
    const marketId = this.resolveMarketId(actor, query.marketId);

    const now = new Date();
    const until = new Date(now);
    until.setUTCDate(until.getUTCDate() + query.withinDays!);

    const where: Prisma.ContractWhereInput = {
      marketId,
      status: ContractStatus.active,
      endDate: { gte: now, lte: until },
    };

    return paginate(this.prisma.contract, {
      where,
      orderBy: { endDate: 'asc' },
      page: query.page,
      limit: query.limit,
      include: {
        shop: { select: { id: true, shopNumber: true } },
        tenant: { select: { id: true, fullName: true, contact: true } },
      },
    });
  }

  async findOne(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const contract = await this.findOrThrow(id);
    this.ensureAccess(
      actor,
      contract.marketId,
      'دسترسی به این قرارداد مجاز نیست',
    );

    return this.prisma.contract.findUnique({
      where: { id },
      include: {
        shop: { select: { id: true, shopNumber: true } },
        tenant: { select: { id: true, fullName: true } },
        guarantor: { select: { id: true, name: true } },
        rentCharges: { orderBy: { periodStart: 'asc' } },
      },
    });
  }

  async update(
    currentUser: { id: string },
    id: string,
    dto: UpdateContractDto,
    meta: RequestMeta = NO_REQUEST_META,
  ) {
    const actor = await this.getActor(currentUser);
    const contract = await this.findOrThrow(id);
    this.ensureAccess(
      actor,
      contract.marketId,
      'دسترسی به این قرارداد مجاز نیست',
    );

    const data: Record<string, unknown> = {};
    if (dto.guarantorId !== undefined) data.guarantorId = dto.guarantorId;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;

    const updated = await this.prisma.contract.update({ where: { id }, data });

    await this.auditLog.record({
      action: 'UPDATE',
      entityType: 'Contract',
      entityId: id,
      marketId: contract.marketId,
      userId: actor.id,
      oldData: contract,
      newData: updated,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return updated;
  }

  // ==========================================================================
  // فسخ زودهنگام — فاکتور دورهٔ دربرگیرنده با فرمول روزانه اصلاح می‌شود،
  // فاکتورهای آیندهٔ نرسیده لغو می‌شوند، دوکان آزاد می‌شود.
  // ==========================================================================
  async terminate(
    currentUser: { id: string },
    id: string,
    dto: TerminateContractDto,
    meta: RequestMeta = NO_REQUEST_META,
  ) {
    const actor = await this.getActor(currentUser);
    const contract = await this.findOrThrow(id);
    this.ensureAccess(
      actor,
      contract.marketId,
      'دسترسی به این قرارداد مجاز نیست',
    );
    if (
      contract.status !== ContractStatus.active &&
      contract.status !== ContractStatus.suspended
    ) {
      throw new ConflictException('فقط قرارداد فعال قابل فسخ است');
    }

    const terminationDate = new Date(dto.terminationDate);
    const prorate = dto.prorate ?? true;

    if (dto.acknowledgeDebt && !dto.reason?.trim()) {
      throw new BadRequestException(
        'برای فسخ با وجود بدهیِ باز، ذکرِ دلیل (reason) الزامی است',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const spanningCharge = prorate
        ? await tx.rentCharges.findFirst({
            where: {
              contractId: id,
              periodStart: { lte: terminationDate },
              periodEnd: { gt: terminationDate },
            },
          })
        : null;

      if (spanningCharge) {
        const actualDays = Math.round(
          (terminationDate.getTime() - spanningCharge.periodStart.getTime()) /
            (1000 * 60 * 60 * 24),
        );
        const newNetAmount = spanningCharge.dailyRate.mul(actualDays);
        const newRemaining = Prisma.Decimal.max(
          0,
          newNetAmount.sub(spanningCharge.paidAmount),
        );

        await tx.rentCharges.update({
          where: { id: spanningCharge.id },
          data: {
            periodEnd: terminationDate,
            days: actualDays,
            grossAmount: newNetAmount,
            netAmount: newNetAmount,
            remainingAmount: newRemaining,
            status: newRemaining.lessThanOrEqualTo(0)
              ? RentChargeStatus.PAID
              : spanningCharge.paidAmount.greaterThan(0)
                ? RentChargeStatus.PARTIAL
                : RentChargeStatus.PENDING,
          },
        });
      }

      await tx.rentCharges.updateMany({
        where: {
          contractId: id,
          periodStart: { gte: terminationDate },
          status: { in: OPEN_STATUSES },
        },
        data: { status: RentChargeStatus.CANCELED },
      });

      await tx.contract.update({
        where: { id },
        data: {
          status: ContractStatus.early_terminated,
          endDate: terminationDate,
          terminatedById: actor.id,
        },
      });

      await tx.contractStatusHistory.create({
        data: {
          contractId: id,
          fromStatus: contract.status,
          toStatus: ContractStatus.early_terminated,
          changedById: actor.id,
          reason: dto.reason?.trim() || null,
        },
      });

      if (contract.shopId) {
        await tx.shop.update({
          where: { id: contract.shopId },
          data: {
            status: 'empty',
            currentContractId: null,
            currentTenantId: null,
          },
        });
      }

      if (contract.tenantId) {
        await this.rentService.recomputeRentDebt(tx, contract.tenantId);
      }

      // محافظ: «اول تسویه، بعد فسخ». بدهیِ باز «بعد از» محاسبهٔ فسخ (تناسبِ روزِ آخر + لغوِ فاکتورهای آینده) سنجیده
      // می‌شود تا عددی که می‌بینید دقیقاً همان است که مستأجر باید بدهد؛ اگر بدهی ماند، کلِ این تراکنش (حتی
      // فاکتورهای اصلاح‌شده) rollback می‌شود و هیچ چیزی عوض نمی‌شود. فقط ادمین با acknowledgeDebt (+ reason)
      // می‌تواند «با بدهیِ باز» فسخ کند؛ بدهی بخشیده نمی‌شود و روی مستأجر می‌ماند.
      const debt = await this.getOutstandingDebt(tx, contract, 'all');
      if (debt.hasDebt && !dto.acknowledgeDebt) {
        throw await this.buildDebtError(tx, contract, debt, 'terminate');
      }

      const finalContract = await tx.contract.findUniqueOrThrow({ where: { id } });

      await this.auditLog.record({
        tx,
        action: 'TERMINATE',
        entityType: 'Contract',
        entityId: id,
        marketId: contract.marketId,
        userId: actor.id,
        oldData: contract,
        newData: debt.hasDebt
          ? {
              ...finalContract,
              debtAtTermination: {
                rent: debt.rent.toString(),
                electricity: debt.electricity.map((e) => ({
                  currencyId: e.currencyId,
                  amount: e.amount.toString(),
                })),
              },
            }
          : finalContract,
        reason: debt.hasDebt ? dto.reason : undefined,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return finalContract;
    });
  }

  // ==========================================================================
  // لغو قرارداد قبل از شروع — مستأجر پشیمان شد و هنوز حتی روز اول نرسیده.
  // برخلاف terminate، اینجا هیچ فاکتوری واقعی نشده، پس چیزی برای فسخ/تسویه نیست:
  // فقط فاکتورهای تولیدشده لغو می‌شوند و دوکان به «خالی» برمی‌گردد. رکورد قرارداد
  // حذف نمی‌شود (برای ردگیری/حسابرسی می‌ماند)، فقط status=cancelled می‌شود.
  // ==========================================================================
  async cancel(
    currentUser: { id: string },
    id: string,
    dto: CancelContractDto,
    meta: RequestMeta = NO_REQUEST_META,
  ) {
    const actor = await this.getActor(currentUser);
    const contract = await this.findOrThrow(id);
    this.ensureAccess(
      actor,
      contract.marketId,
      'دسترسی به این قرارداد مجاز نیست',
    );

    if (contract.status !== ContractStatus.draft) {
      throw new ConflictException(
        'فقط قراردادی که هنوز شروع نشده (draft) قابل لغو است — قرارداد شروع‌شده را باید فسخ (terminate) کرد',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.rentCharges.updateMany({
        where: { contractId: id, status: { in: OPEN_STATUSES } },
        data: { status: RentChargeStatus.CANCELED },
      });

      const updatedContract = await tx.contract.update({
        where: { id },
        data: { status: ContractStatus.cancelled },
      });

      await tx.contractStatusHistory.create({
        data: {
          contractId: id,
          fromStatus: contract.status,
          toStatus: ContractStatus.cancelled,
          changedById: actor.id,
          reason: dto.reason?.trim() || null,
        },
      });

      if (contract.shopId) {
        await tx.shop.update({
          where: { id: contract.shopId },
          data: {
            status: 'empty',
            currentContractId: null,
            currentTenantId: null,
          },
        });
      }

      await this.auditLog.record({
        tx,
        action: 'UPDATE',
        entityType: 'Contract',
        entityId: id,
        marketId: contract.marketId,
        userId: actor.id,
        oldData: contract,
        newData: updatedContract,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return updatedContract;
    });
  }

  // ==========================================================================
  // تمدید — قرارداد فعلی را می‌بندد (expired) و بلافاصله از همان روزی که تمام
  // می‌شود یک قرارداد جدیِ پیوسته می‌سازد (دوکان هرگز «خالی» نمی‌شود). شرط: مستأجر کرایه یا
  // برقِ سررسیدشده بدهکار نباشد (وگرنه ۴۰۹ و اول تسویه از امانت یا نقد).
  // امانت (securityDeposit) به قرارداد جدید منتقل می‌شود تا دوباره‌شمار نشود.
  // ==========================================================================
  async renew(
    currentUser: { id: string },
    id: string,
    dto: RenewContractDto,
    meta: RequestMeta = NO_REQUEST_META,
  ) {
    const actor = await this.getActor(currentUser);
    const contract = await this.findOrThrow(id);
    this.ensureAccess(
      actor,
      contract.marketId,
      'دسترسی به این قرارداد مجاز نیست',
    );

    if (
      contract.status !== ContractStatus.active &&
      contract.status !== ContractStatus.expired
    ) {
      throw new ConflictException(
        'فقط قرارداد فعال یا تمام‌شده قابل تمدید است',
      );
    }

    // تمدیدِ زودهنگام (مثلاً ماه‌ها قبل از پایان) قرارداد فعلی را همین الان expired می‌کند
    // در حالی‌که هنوز فاکتورهای واقعی و بازِ زیادی رویش مانده — این فاکتورها به‌خاطر renew
    // لغو نمی‌شوند (بر خلاف terminate)، پس زیر یک قراردادِ ظاهراً «تمام‌شده» معلق می‌مانند.
    // فقط از ۳۰ روز مانده به پایان (یا بعد از پایان) اجازه می‌دهیم.
    const RENEW_WINDOW_DAYS = 30;
    if (contract.status === ContractStatus.active) {
      const daysUntilEnd = Math.ceil(
        (contract.endDate!.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      if (daysUntilEnd > RENEW_WINDOW_DAYS) {
        throw new ConflictException(
          `این قرارداد هنوز ${daysUntilEnd} روز تا پایانش مانده — تمدید فقط از ${RENEW_WINDOW_DAYS} روز مانده به پایان (یا بعد از آن) مجاز است`,
        );
      }
    }
    if (
      !contract.shopId ||
      !contract.tenantId ||
      !contract.endDate ||
      !contract.currencyId ||
      !contract.rent
    ) {
      throw new BadRequestException('قرارداد ناقص است');
    }

    const alreadyRenewed = await this.prisma.contract.findFirst({
      where: { renewedFromContractId: id },
    });
    if (alreadyRenewed) {
      throw new ConflictException('این قرارداد قبلاً تمدید شده است');
    }

    const newStartDate = contract.endDate;
    const newEndDate = new Date(dto.newEndDate);
    if (newEndDate <= newStartDate) {
      throw new BadRequestException(
        'تاریخ پایان جدید باید بعد از تاریخ پایان قرارداد قبلی باشد',
      );
    }

    // اگر shopId داده شود، همین عملیات مستأجر را به دوکانِ دیگری هم منتقل می‌کند —
    // دوکانِ قدیمی (چون مستأجر واقعاً دارد می‌رود) آزاد می‌شود، دوکانِ جدید اشغال.
    // اگر ندهید، دقیقاً همان دوکانِ قبلی ادامه پیدا می‌کند (بدون خالی‌شدنِ لحظه‌ای).
    const newShopId = dto.shopId ?? contract.shopId!;
    const isShopChanging = newShopId !== contract.shopId;
    if (isShopChanging) {
      const newShop = await this.prisma.shop.findUnique({
        where: { id: newShopId },
      });
      if (!newShop) throw new NotFoundException('دوکانِ جدید یافت نشد');
      if (newShop.marketId !== contract.marketId) {
        throw new BadRequestException(
          'دوکانِ جدید باید متعلق به همان بازار باشد',
        );
      }
      const activeOnNewShop = await this.prisma.contract.findFirst({
        where: {
          shopId: newShopId,
          status: { in: [ContractStatus.active, ContractStatus.suspended] },
        },
      });
      if (activeOnNewShop) {
        throw new ConflictException('دوکانِ جدید از قبل یک قرارداد فعال دارد');
      }
    }

    // اگر کرایه در تمدید داده نشود، به‌جای contract.rent (رقم اصلیِ امضاشده که با
    // adjust-rent دیگر لزوماً نرخ واقعی نیست)، آخرین فاکتورِ همین قرارداد را می‌خوانیم —
    // یعنی نرخی که همین الان واقعاً جاری است. این‌طور اگر حسابدار حین تمدید فراموش کند
    // دوباره تخفیف را بگوید، تخفیف قبلی بی‌سروصدا از بین نمی‌رود، خودکار ادامه پیدا می‌کند.
    const lastCharge = await this.prisma.rentCharges.findFirst({
      where: { contractId: id },
      orderBy: { periodStart: 'desc' },
      select: { netAmount: true },
    });
    const effectiveRent = lastCharge?.netAmount ?? contract.rent;
    const rent = dto.rent ? new Prisma.Decimal(dto.rent) : effectiveRent;
    const carriedDeposit =
      contract.securityDepositRemaining ?? new Prisma.Decimal(0);
    // همان قاعدهٔ create(): اگر newStartDate هنوز نرسیده (تمدید زودهنگام، تا ۳۰ روز قبل
    // مجاز است)، قرارداد جدید draft می‌شود، نه active — تا وقتی کرونِ activateStartedContracts
    // خودش سر تاریخ آن را فعال کند.
    const isNewStarted = newStartDate <= new Date();

    return this.prisma.$transaction(async (tx) => {
      // محافظ: مستأجری که کرایه یا برقِ سررسیدشده بدهکار است قراردادش تمدید نمی‌شود — اول تسویه (از امانت یا نقد).
      // کرایهٔ ماه‌های بعد (periodStart نرسیده) هنوز بدهی حساب نمی‌شود. برخلافِ فسخ، «تمدید با بدهی» راه ندارد.
      const debt = await this.getOutstandingDebt(tx, contract, 'due');
      if (debt.hasDebt) {
        throw await this.buildDebtError(tx, contract, debt, 'renew');
      }

      await tx.contract.update({
        where: { id },
        data: { status: ContractStatus.expired, securityDepositRemaining: 0 },
      });

      await tx.contractStatusHistory.create({
        data: {
          contractId: id,
          fromStatus: contract.status,
          toStatus: ContractStatus.expired,
          changedById: actor.id,
          reason: 'تمدید شد به قرارداد جدید',
        },
      });

      const newContract = await tx.contract.create({
        data: {
          marketId: contract.marketId,
          shopId: newShopId,
          tenantId: contract.tenantId,
          guarantorId: dto.guarantorId ?? contract.guarantorId,
          startDate: newStartDate,
          endDate: newEndDate,
          rent,
          currencyId: contract.currencyId,
          notes: dto.notes?.trim() || null,
          status: isNewStarted ? ContractStatus.active : ContractStatus.draft,
          securityDeposit: contract.securityDeposit ?? 0,
          securityDepositRemaining: carriedDeposit,
          securityDepositAccountId: contract.securityDepositAccountId,
          renewedFromContractId: id,
        },
      });

      await this.rentService.generateChargesForContract(tx, {
        id: newContract.id,
        marketId: contract.marketId,
        shopId: newShopId,
        tenantId: contract.tenantId!,
        startDate: newStartDate,
        endDate: newEndDate,
        rent,
        currencyId: contract.currencyId!,
      });

      if (isShopChanging) {
        await tx.shop.update({
          where: { id: contract.shopId! },
          data: { status: 'empty', currentContractId: null, currentTenantId: null },
        });
        await tx.shop.update({
          where: { id: newShopId },
          data: {
            status: isNewStarted ? 'rented' : 'pending',
            currentContractId: newContract.id,
            currentTenantId: contract.tenantId,
          },
        });
      } else {
        await tx.shop.update({
          where: { id: newShopId },
          data: {
            status: isNewStarted ? 'rented' : 'pending',
            currentContractId: newContract.id,
            currentTenantId: contract.tenantId,
          },
        });
      }

      const finalNewContract = await tx.contract.findUniqueOrThrow({
        where: { id: newContract.id },
      });

      await this.auditLog.record({
        tx,
        action: 'RENEW',
        entityType: 'Contract',
        entityId: id,
        marketId: contract.marketId,
        userId: actor.id,
        oldData: contract,
        newData: finalNewContract,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return finalNewContract;
    });
  }

  // ==========================================================================
  // تسویهٔ نهایی — بدهیِ زندهٔ کرایه (این قرارداد) و برق (همین مستأجر/دوکان) را از
  // رکوردهای واقعی حساب می‌کند (نه چیزی که ادمین دستی وارد کند). هر مقدار که با پول نقد
  // (cashAmount) پوشش داده نشود، طبق settlementMethod بخشیده (write-off) می‌شود، پس بعد
  // از این متد دیگر این مستأجر برای این قرارداد در findAllDebts بدهکار نشان داده نمی‌شود.
  // ==========================================================================
  async settle(
    currentUser: { id: string },
    id: string,
    dto: SettleContractDto,
    meta: RequestMeta = NO_REQUEST_META,
  ) {
    const actor = await this.getActor(currentUser);
    const contract = await this.findOrThrow(id);
    this.ensureAccess(
      actor,
      contract.marketId,
      'دسترسی به این قرارداد مجاز نیست',
    );
    if (!contract.tenantId || !contract.shopId || !contract.currencyId) {
      throw new BadRequestException('قرارداد ناقص است');
    }

    const existing = await this.prisma.contractSettlement.findUnique({
      where: { contractId: id },
    });
    if (existing) {
      throw new ConflictException('این قرارداد قبلاً تسویه شده است');
    }

    const cashAmount = new Prisma.Decimal(dto.cashAmount ?? 0);

    if (
      dto.settlementMethod === SettlementMethod.CASH &&
      cashAmount.lessThanOrEqualTo(0)
    ) {
      throw new BadRequestException(
        'برای روش نقدی، cashAmount باید بزرگ‌تر از صفر باشد',
      );
    }
    if (
      (dto.settlementMethod === SettlementMethod.WRITE_OFF ||
        dto.settlementMethod === SettlementMethod.COLLATERAL) &&
      cashAmount.greaterThan(0)
    ) {
      throw new BadRequestException(
        'برای روش WRITE_OFF یا COLLATERAL، cashAmount باید صفر باشد — اگر بخشی نقد است از روش MIXED استفاده کنید',
      );
    }

    let account: { id: string; marketId: string; currencyId: string } | null =
      null;
    if (cashAmount.greaterThan(0)) {
      if (!dto.accountId)
        throw new BadRequestException('برای دریافت نقد، accountId الزامی است');
      account = await this.prisma.account.findUnique({
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

    const settledAt = dto.settledAt ? new Date(dto.settledAt) : new Date();
    const paymentMethod = dto.paymentMethod ?? 'cash';

    return this.prisma.$transaction(async (tx) => {
      const finalRentDebt = await this.rentService.getOpenDebtForContract(
        tx,
        id,
      );
      const finalElectricityDebt =
        await this.electricityService.getOpenDebtForShop(
          tx,
          contract.tenantId!,
          contract.shopId!,
        );
      const totalDebt = finalRentDebt.add(finalElectricityDebt);

      if (cashAmount.greaterThan(totalDebt)) {
        throw new BadRequestException(
          `مبلغ نقدِ واردشده (${cashAmount.toString()}) از کل بدهی این قرارداد (${totalDebt.toString()}) بیشتر است`,
        );
      }
      if (
        dto.settlementMethod === SettlementMethod.CASH &&
        !cashAmount.equals(totalDebt)
      ) {
        throw new BadRequestException(
          `برای روش نقدی، cashAmount باید دقیقاً برابر کل بدهی باشد (کل بدهی: ${totalDebt.toString()}) — برای تسویهٔ بخشی از روش MIXED استفاده کنید`,
        );
      }

      const cashForRent = Prisma.Decimal.min(cashAmount, finalRentDebt);
      const cashForElectricity = cashAmount.sub(cashForRent);

      if (cashForRent.greaterThan(0)) {
        await this.rentService.recordPayment(
          tx,
          actor,
          {
            contract: {
              id,
              marketId: contract.marketId,
              tenantId: contract.tenantId!,
              shopId: contract.shopId!,
              currencyId: contract.currencyId!,
              securityDepositRemaining: null,
            },
            amount: cashForRent,
            paymentDate: settledAt,
            paymentMethod,
            source: PaymentSourceType.BANK,
            accountId: dto.accountId,
            isOpeningEntry: false,
            notes: 'دریافت نقد هنگام تسویهٔ نهایی قرارداد',
          },
          meta,
        );
      }
      if (cashForElectricity.greaterThan(0)) {
        await this.electricityService.recordPayment(
          tx,
          actor,
          {
            marketId: contract.marketId,
            shopId: contract.shopId!,
            tenantId: contract.tenantId!,
            currencyId: contract.currencyId!,
            amount: cashForElectricity,
            paymentDate: settledAt,
            paymentMethod,
            source: PaymentSourceType.BANK,
            accountId: dto.accountId,
            isOpeningEntry: false,
            notes: 'دریافت نقد هنگام تسویهٔ نهایی قرارداد',
          },
          meta,
        );
      }

      const writeOffNote = `تسویهٔ نهاییِ قرارداد (${dto.settlementMethod})${dto.notes ? ` — ${dto.notes.trim()}` : ''}`;
      await this.rentService.writeOffOpenCharges(
        tx,
        id,
        contract.tenantId!,
        writeOffNote,
      );
      await this.electricityService.writeOffOpenBillsForShop(
        tx,
        contract.tenantId!,
        contract.shopId!,
        writeOffNote,
      );

      const settlement = await tx.contractSettlement.create({
        data: {
          contractId: id,
          finalRentDebt,
          finalElectricityDebt,
          settlementMethod: dto.settlementMethod,
          settledAmount: totalDebt,
          currencyId: contract.currencyId!,
          notes: dto.notes?.trim() || null,
          approvedById: actor.id,
          settledAt,
        },
      });

      await this.auditLog.record({
        tx,
        action: 'CREATE',
        entityType: 'ContractSettlement',
        entityId: settlement.id,
        marketId: contract.marketId,
        userId: actor.id,
        newData: settlement,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return settlement;
    });
  }

  // پرداخت ترکیبیِ کرایه + برق، از یک حساب، در یک تراکنش — برای وقتی که مستأجر یک پرداخت
  // نقدی می‌آورد که هم کرایه و هم برق را پوشش می‌دهد؛ به‌جای دو بار مراجعه به
  // POST /rent/payments و POST /electricity/payments جدا. rentAmount با ارزِ خودِ قرارداد
  // پرداخت می‌شود؛ electricityAmount با ارزِ بل‌های بازِ همین مستأجر (ممکن است با ارز
  // قرارداد فرق کند) — اگر یک accountId نتواند هر دو ارز را پوشش دهد، خطای واضح می‌دهد
  // تا آن بخش را جدا (از /electricity/payments) پرداخت کنند.
  // idempotencyKey (هدر Idempotency-Key): تلاشِ دوبارهٔ همان درخواست (دابل‌کلیک) پرداختِ دوم نمی‌سازد
  // و همان پاسخِ قبلی را برمی‌گرداند؛ کلِ پرداختِ ترکیبی (کرایه+برق) یک واحد است.
  async payDebt(
    currentUser: { id: string },
    id: string,
    dto: PayContractDebtDto,
    meta: RequestMeta = NO_REQUEST_META,
    idempotencyKey?: string,
  ) {
    const actor = await this.getActor(currentUser);
    const contract = await this.findOrThrow(id);
    this.ensureAccess(
      actor,
      contract.marketId,
      'دسترسی به این قرارداد مجاز نیست',
    );
    if (!contract.tenantId || !contract.shopId || !contract.currencyId) {
      throw new BadRequestException('قرارداد ناقص است');
    }

    const rentAmount = new Prisma.Decimal(dto.rentAmount ?? 0);
    const electricityAmount = new Prisma.Decimal(dto.electricityAmount ?? 0);
    if (
      rentAmount.lessThanOrEqualTo(0) &&
      electricityAmount.lessThanOrEqualTo(0)
    ) {
      throw new BadRequestException(
        'حداقل یکی از rentAmount یا electricityAmount باید بزرگ‌تر از صفر باشد',
      );
    }

    const account = await this.prisma.account.findUnique({
      where: { id: dto.accountId },
    });
    if (!account) throw new NotFoundException('حساب یافت نشد');
    if (account.marketId !== contract.marketId) {
      throw new BadRequestException('حساب باید متعلق به همان بازار باشد');
    }
    if (
      rentAmount.greaterThan(0) &&
      account.currencyId !== contract.currencyId
    ) {
      throw new BadRequestException(
        'ارز حساب باید با ارز قرارداد یکی باشد (برای بخشِ کرایه)',
      );
    }

    const paymentDate = dto.paymentDate ? new Date(dto.paymentDate) : new Date();
    const paymentMethod = dto.paymentMethod ?? 'cash';

    return runIdempotent(this.prisma, {
      userId: actor.id,
      scope: 'CONTRACT_PAY_DEBT',
      key: idempotencyKey,
      requestHash: hashRequest({ contractId: id, ...dto }),
      work: async (tx) => {
      const result: {
        rentPayment: Awaited<ReturnType<RentService['recordPayment']>> | null;
        electricityPayment:
          | Awaited<ReturnType<ElectricityService['recordPayment']>>
          | null;
      } = { rentPayment: null, electricityPayment: null };

      if (rentAmount.greaterThan(0)) {
        result.rentPayment = await this.rentService.recordPayment(
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
            amount: rentAmount,
            paymentDate,
            paymentMethod,
            source: PaymentSourceType.BANK,
            accountId: dto.accountId,
            isOpeningEntry: false,
            notes: dto.notes,
            receiptNumber: dto.receiptNumber,
          },
          meta,
        );
      }

      if (electricityAmount.greaterThan(0)) {
        const openBill = await tx.electricityBill.findFirst({
          where: {
            tenantId: contract.tenantId!,
            status: { in: ELECTRICITY_OPEN_STATUSES },
          },
        });
        const electricityCurrencyId =
          openBill?.currencyId ?? contract.currencyId!;
        if (account.currencyId !== electricityCurrencyId) {
          throw new BadRequestException(
            'ارز حساب باید با ارز بل‌های بازِ برق یکی باشد (برای بخشِ برق) — این بخش را جدا پرداخت کنید',
          );
        }

        result.electricityPayment = await this.electricityService.recordPayment(
          tx,
          actor,
          {
            marketId: contract.marketId,
            shopId: contract.shopId!,
            tenantId: contract.tenantId!,
            currencyId: electricityCurrencyId,
            amount: electricityAmount,
            paymentDate,
            paymentMethod,
            source: PaymentSourceType.BANK,
            accountId: dto.accountId,
            isOpeningEntry: false,
            notes: dto.notes,
            receiptNumber: dto.receiptNumber,
          },
          meta,
        );
      }

      return result;
      },
    });
  }

  // ==========================================================================
  // خلاصهٔ تسویه: بدهیِ باز (کرایه + برق به تفکیکِ ارز) در برابرِ امانتِ باقی‌مانده — صفحهٔ «تسویهٔ حساب» فرانت
  // همین را نشان می‌دهد؛ مبلغ‌های سررسیدشده (due) همان چیزی است که برای تمدید باید صفر باشد.
  // ==========================================================================
  async getSettlementSummary(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const contract = await this.findOrThrow(id);
    this.ensureAccess(actor, contract.marketId, 'دسترسی به این قرارداد مجاز نیست');

    const [due, allOpen] = await Promise.all([
      this.getOutstandingDebt(this.prisma, contract, 'due'),
      this.getOutstandingDebt(this.prisma, contract, 'all'),
    ]);

    const ids = [contract.currencyId, ...allOpen.electricity.map((e) => e.currencyId)].filter(
      (v): v is string => !!v,
    );
    const currencies = ids.length
      ? await this.prisma.currency.findMany({ where: { id: { in: ids } }, select: { id: true, code: true } })
      : [];
    const code = (cid: string | null) => currencies.find((c) => c.id === cid)?.code ?? null;

    const deposit = contract.securityDepositRemaining ?? new Prisma.Decimal(0);
    // امانت فقط بدهیِ «هم‌ارزِ خودش» را می‌پوشاند: کرایه (ارز قرارداد) + برقِ هم‌ارز.
    const electricitySameCurrency = allOpen.electricity
      .filter((e) => e.currencyId === contract.currencyId)
      .reduce((s, e) => s.add(e.amount), new Prisma.Decimal(0));
    const coverable = due.rent.add(electricitySameCurrency);
    const otherCurrencyElectricity = allOpen.electricity.filter((e) => e.currencyId !== contract.currencyId);

    return {
      contractId: contract.id,
      status: contract.status,
      currency: { id: contract.currencyId, code: code(contract.currencyId) },
      rentDebt: { due: due.rent, allOpen: allOpen.rent },
      electricityDebt: allOpen.electricity.map((e) => ({
        currencyId: e.currencyId,
        currencyCode: code(e.currencyId),
        amount: e.amount,
        billsCount: e.billsCount,
      })),
      depositRemaining: deposit,
      // بدهیِ سررسیدشدهٔ قابل‌پوشش با امانت و نتیجه‌اش (اگر برقِ ارزِ دیگری هست، با امانت پوشیده نمی‌شود: نقد).
      dueDebtCoverableByDeposit: coverable,
      depositCoversDueDebt: deposit.greaterThanOrEqualTo(coverable),
      depositLeftAfterDebt: Prisma.Decimal.max(0, deposit.sub(coverable)),
      shortfallToPayInCash: Prisma.Decimal.max(0, coverable.sub(deposit)),
      electricityInOtherCurrency: otherCurrencyElectricity.map((e) => ({
        currencyId: e.currencyId,
        currencyCode: code(e.currencyId),
        amount: e.amount,
      })),
      hasDueDebt: due.hasDebt,
    };
  }

  // ==========================================================================
  // تسویه از محل امانت — مبلغِ کرایه و برق جدا و دستی (هیچ تقسیمِ خودکار نیست). هر بخش یک پرداختِ مستقل
  // (source=SECURITY_DEPOSIT) با FIFO روی بل‌های بازِ خودش؛ فقط securityDepositRemaining کم می‌شود. برای قراردادِ
  // فعال/معلق (قبل از فسخ) و فسخ‌شده/منقضی (برای بدهیِ قدیمی) مجاز است. امانت فقط بدهیِ هم‌ارزِ خودش را می‌پوشاند.
  // قفلِ مشورتیِ «امانتِ این قرارداد» دو برداشتِ هم‌زمان را پشتِ هم می‌گذارد تا امانت دوبار خرج نشود.
  // ==========================================================================
  async payFromDeposit(
    currentUser: { id: string },
    id: string,
    dto: PayFromDepositDto,
    meta: RequestMeta = NO_REQUEST_META,
    idempotencyKey?: string,
  ) {
    const actor = await this.getActor(currentUser);
    const contract = await this.findOrThrow(id);
    this.ensureAccess(actor, contract.marketId, 'دسترسی به این قرارداد مجاز نیست');
    if (!contract.tenantId || !contract.shopId || !contract.currencyId) {
      throw new BadRequestException('قرارداد ناقص است');
    }
    if (
      contract.status === ContractStatus.draft ||
      contract.status === ContractStatus.cancelled
    ) {
      throw new ConflictException('قراردادِ شروع‌نشده یا لغوشده بدهی ندارد که از امانت تسویه شود');
    }

    const rentAmount = new Prisma.Decimal(dto.rentAmount ?? 0);
    const electricityAmount = new Prisma.Decimal(dto.electricityAmount ?? 0);
    if (rentAmount.lessThanOrEqualTo(0) && electricityAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('حداقل یکی از rentAmount یا electricityAmount باید بزرگ‌تر از صفر باشد');
    }
    const paymentDate = dto.paymentDate ? new Date(dto.paymentDate) : new Date();
    assertPaymentDateNotInFuture(paymentDate);
    const notes = dto.notes?.trim() || 'پرداخت از محل امانت';
    const { tenantId, shopId, currencyId } = contract;

    return runIdempotent(this.prisma, {
      userId: actor.id,
      scope: 'CONTRACT_PAY_FROM_DEPOSIT',
      key: idempotencyKey,
      requestHash: hashRequest({ contractId: id, ...dto }),
      work: async (tx) => {
        await acquireAdvisoryXactLock(tx, `contract-deposit:${id}`);
        const fresh = await tx.contract.findUniqueOrThrow({ where: { id } });
        let remaining = fresh.securityDepositRemaining ?? new Prisma.Decimal(0);

        const total = rentAmount.add(electricityAmount);
        if (total.greaterThan(remaining)) {
          throw new ConflictException(
            `امانتِ باقی‌مانده (${remaining.toString()}) برای این مبلغ (${total.toString()}) کافی نیست — باقی را مستأجر نقد می‌دهد: POST /contracts/${id}/pay-debt`,
          );
        }

        const result: {
          rentPayment: Awaited<ReturnType<RentService['recordPayment']>> | null;
          electricityPayment: Awaited<ReturnType<ElectricityService['recordPayment']>> | null;
          depositRemaining: Prisma.Decimal;
        } = { rentPayment: null, electricityPayment: null, depositRemaining: remaining };

        if (rentAmount.greaterThan(0)) {
          result.rentPayment = await this.rentService.recordPayment(
            tx,
            actor,
            {
              contract: {
                id,
                marketId: contract.marketId,
                tenantId,
                shopId,
                currencyId,
                securityDepositRemaining: remaining,
              },
              amount: rentAmount,
              paymentDate,
              paymentMethod: 'cash',
              source: PaymentSourceType.SECURITY_DEPOSIT,
              isOpeningEntry: false,
              notes,
            },
            meta,
          );
          remaining = remaining.sub(rentAmount);
        }

        if (electricityAmount.greaterThan(0)) {
          const debts = await this.electricityService.getOpenDebtByCurrencyForShop(tx, tenantId, shopId);
          if (debts.length === 0) {
            throw new BadRequestException('هیچ بلِ بازِ برقی برای این مستأجر/دوکان وجود ندارد');
          }
          if (debts.some((d) => d.currencyId !== currencyId)) {
            throw new BadRequestException(
              'ارزِ بل‌های بازِ برق با ارزِ امانت (ارزِ قرارداد) یکی نیست — امانت فقط بدهیِ هم‌ارزِ خودش را می‌پوشاند؛ برق را نقد پرداخت کنید',
            );
          }
          result.electricityPayment = await this.electricityService.recordPayment(
            tx,
            actor,
            {
              marketId: contract.marketId,
              shopId,
              tenantId,
              currencyId,
              amount: electricityAmount,
              paymentDate,
              paymentMethod: 'cash',
              source: PaymentSourceType.SECURITY_DEPOSIT,
              isOpeningEntry: false,
              notes,
              securityDeposit: { contractId: id, remaining },
            },
            meta,
          );
          remaining = remaining.sub(electricityAmount);
        }

        result.depositRemaining = remaining;
        return result;
      },
    });
  }

  // ==========================================================================
  // برگرداندنِ امانتِ باقی‌مانده به مستأجر — فقط بعد از فسخ/پایان/لغوِ قرارداد و فقط وقتی هیچ بدهیِ بازِ کرایه یا
  // برقی نمانده. پول از accountId (هم‌ارزِ قرارداد، با موجودیِ کافی) کم می‌شود: ledger از نوعِ OUT (متقارنِ با ledgerِ
  // IN هنگامِ دریافتِ امانت) + کم‌شدنِ securityDepositRemaining + audit. ثبتِ دوباره با Idempotency-Key امن است.
  // ==========================================================================
  async refundDeposit(
    currentUser: { id: string },
    id: string,
    dto: RefundDepositDto,
    meta: RequestMeta = NO_REQUEST_META,
    idempotencyKey?: string,
  ) {
    const actor = await this.getActor(currentUser);
    const contract = await this.findOrThrow(id);
    this.ensureAccess(actor, contract.marketId, 'دسترسی به این قرارداد مجاز نیست');
    if (!contract.tenantId || !contract.shopId || !contract.currencyId) {
      throw new BadRequestException('قرارداد ناقص است');
    }
    const refundable: ContractStatus[] = [
      ContractStatus.early_terminated,
      ContractStatus.expired,
      ContractStatus.cancelled,
    ];
    if (!refundable.includes(contract.status)) {
      throw new ConflictException(
        'امانت فقط بعد از فسخ، پایان یا لغوِ قرارداد برگردانده می‌شود — قراردادِ جاری هنوز امانت را نگه می‌دارد',
      );
    }

    const account = await this.prisma.account.findUnique({ where: { id: dto.accountId } });
    if (!account) throw new NotFoundException('حساب یافت نشد');
    if (account.marketId !== contract.marketId) {
      throw new BadRequestException('حساب باید متعلق به همان بازار باشد');
    }
    if (!account.isActive) throw new ConflictException('حساب غیرفعال است');
    if (account.currencyId !== contract.currencyId) {
      throw new BadRequestException('ارز حساب باید با ارز قرارداد (ارزِ امانت) یکی باشد');
    }

    const refundDate = dto.refundDate ? new Date(dto.refundDate) : new Date();
    assertPaymentDateNotInFuture(refundDate);
    const shop = await this.prisma.shop.findUnique({
      where: { id: contract.shopId },
      select: { shopNumber: true },
    });
    const { currencyId } = contract;

    return runIdempotent(this.prisma, {
      userId: actor.id,
      scope: 'CONTRACT_REFUND_DEPOSIT',
      key: idempotencyKey,
      requestHash: hashRequest({ contractId: id, ...dto }),
      work: async (tx) => {
        await acquireAdvisoryXactLock(tx, `contract-deposit:${id}`);
        const fresh = await tx.contract.findUniqueOrThrow({ where: { id } });
        const remaining = fresh.securityDepositRemaining ?? new Prisma.Decimal(0);
        if (remaining.lessThanOrEqualTo(0)) {
          throw new ConflictException('امانتِ باقی‌مانده‌ای برای برگرداندن نیست');
        }
        const amount = dto.amount !== undefined ? new Prisma.Decimal(dto.amount) : remaining;
        if (amount.greaterThan(remaining)) {
          throw new ConflictException(
            `مبلغ (${amount.toString()}) از امانتِ باقی‌مانده (${remaining.toString()}) بیشتر است`,
          );
        }

        // اول تسویه: تا بدهیِ بازی هست امانت پس داده نمی‌شود.
        const debt = await this.getOutstandingDebt(tx, fresh, 'all');
        if (debt.hasDebt) throw await this.buildDebtError(tx, fresh, debt, 'refund-deposit');

        const rate = await resolveRateToBase(tx, {
          marketId: contract.marketId,
          currencyId,
          date: refundDate,
          amount,
        });

        // کم‌کردنِ موجودیِ حساب فقط اگر کافی باشد (شرط داخلِ خودِ UPDATE)، و کم‌کردنِ امانت فقط اگر هنوز همان‌قدر مانده باشد.
        const debited = await tx.account.updateMany({
          where: { id: account.id, balance: { gte: amount } },
          data: { balance: { decrement: amount } },
        });
        if (debited.count === 0) {
          throw new ConflictException('موجودیِ حساب برای این برگشتِ امانت کافی نیست');
        }
        const updatedAccount = await tx.account.findUniqueOrThrow({ where: { id: account.id } });

        const depositUpdated = await tx.contract.updateMany({
          where: { id, securityDepositRemaining: { gte: amount } },
          data: { securityDepositRemaining: { decrement: amount } },
        });
        if (depositUpdated.count === 0) {
          throw new ConflictException('امانتِ باقی‌مانده هم‌زمان تغییر کرد — دوباره تلاش کنید');
        }

        const ledger = await tx.ledgerEntry.create({
          data: {
            marketId: contract.marketId,
            accountId: account.id,
            currencyId,
            direction: 'OUT',
            amount,
            balanceAfter: updatedAccount.balance,
            exchangeRate: rate.exchangeRate,
            baseCurrencyAmount: rate.baseCurrencyAmount,
            entryDate: refundDate,
            description:
              `برگشتِ امانت قرارداد دوکان «${shop?.shopNumber ?? ''}»${dto.notes ? ` — ${dto.notes.trim()}` : ''}`.trim(),
            createdById: actor.id,
          },
        });

        const newRemaining = remaining.sub(amount);
        await this.auditLog.record({
          tx,
          action: 'UPDATE',
          entityType: 'Contract',
          entityId: id,
          marketId: contract.marketId,
          userId: actor.id,
          oldData: { securityDepositRemaining: remaining },
          newData: {
            securityDepositRemaining: newRemaining,
            depositRefund: { amount, accountId: account.id, ledgerEntryId: ledger.id },
          },
          reason: dto.notes?.trim() || 'برگشتِ امانت به مستأجر',
          ip: meta.ip,
          userAgent: meta.userAgent,
        });

        return {
          contractId: id,
          refundedAmount: amount,
          depositRemaining: newRemaining,
          accountId: account.id,
          accountBalanceAfter: updatedAccount.balance,
          ledgerEntryId: ledger.id,
        };
      },
    });
  }

  // هر شب: قراردادهایی که endDate‌شان گذشته و هیچ‌کس نه تمدید نه فسخ کرده، فقط برچسبِ
  // status را «expired» می‌کند — دقیقاً مثل flagOverdueCharges در RentService. عمداً به
  // دوکان یا مستأجرِ فعلی دست نمی‌زند (چون معلوم نیست مستأجر واقعاً رفته یا فقط کاغذبازیِ
  // تمدید عقب افتاده)؛ فقط این‌طور در GET /contracts?status=active دیگر دیده نمی‌شود و
  // در status=expired قابل پیگیری می‌ماند تا کسی تصمیم بگیرد تمدید یا فسخ کند.
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async flagExpiredContracts() {
    await this.prisma.contract.updateMany({
      where: { status: ContractStatus.active, endDate: { lt: new Date() } },
      data: { status: ContractStatus.expired },
    });
  }

  // برعکسِ flagExpiredContracts — قراردادهای draft (تاریخ شروعشان در آینده بود، یا از
  // یک تمدیدِ زودهنگام آمده‌اند) را وقتی startDate واقعاً رسید، خودکار active می‌کند و
  // دوکانِ مربوطه را rented می‌گذارد. بدون این، هیچ‌چیز دیگری هیچ‌وقت draft را عوض نمی‌کرد.
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async activateStartedContracts() {
    const started = await this.prisma.contract.findMany({
      where: { status: ContractStatus.draft, startDate: { lte: new Date() } },
      select: { id: true, shopId: true },
    });
    if (started.length === 0) return;

    await this.prisma.contract.updateMany({
      where: { id: { in: started.map((c) => c.id) } },
      data: { status: ContractStatus.active },
    });

    const shopIds = started
      .map((c) => c.shopId)
      .filter((shopId): shopId is string => !!shopId);
    if (shopIds.length > 0) {
      await this.prisma.shop.updateMany({
        where: { id: { in: shopIds } },
        data: { status: 'rented' },
      });
    }
  }
}
