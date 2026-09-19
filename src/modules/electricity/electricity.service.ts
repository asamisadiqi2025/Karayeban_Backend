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
  ElectricityBillStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ensureMarketSetupComplete } from '../../common/utils/ensure-market-setup-complete';
import { ensureCurrencyEnabledForMarket } from '../../common/utils/ensure-currency-enabled-for-market';
import { paginate, resolveSort } from '../../common/utils/pagination';
import { CreateElectricityBillDto } from './dto/create-electricity-bill.dto';
import { ElectricityBillQueryDto } from './dto/electricity-bill-query.dto';
import { CreateElectricityPaymentDto } from './dto/create-electricity-payment.dto';
import { ElectricityPaymentQueryDto } from './dto/electricity-payment-query.dto';
import { ElectricityDebtQueryDto } from './dto/electricity-debt-query.dto';

type Actor = { id: string; role: string; marketId: string | null };

const OPEN_STATUSES: ElectricityBillStatus[] = [
  ElectricityBillStatus.PENDING,
  ElectricityBillStatus.PARTIAL,
  ElectricityBillStatus.OVERDUE,
];

// همان موتور FIFO که برای کرایه ساختیم (src/modules/rent/rent.service.ts)، فقط بدون تابع
// تولید فاکتور — چون بل برق فرمول ثابت ندارد و همیشه دستی (بر مبنای قرائت کنتور) ثبت می‌شود.
@Injectable()
export class ElectricityService {
  private static readonly BILL_SORT_FIELDS = [
    'periodStart',
    'createdAt',
  ] as const;
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

  // ==========================================================================
  // بل‌ها — ثبت دستی (نه تولید خودکار).
  // ==========================================================================
  async createBill(currentUser: { id: string }, dto: CreateElectricityBillDto) {
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

    if (dto.tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: dto.tenantId },
      });
      if (!tenant) throw new NotFoundException('مستأجر یافت نشد');
      if (tenant.marketId !== marketId) {
        throw new BadRequestException('مستأجر باید متعلق به همان بازار باشد');
      }
    }

    if (dto.meterId) {
      const meter = await this.prisma.electricityMeter.findUnique({
        where: { id: dto.meterId },
      });
      if (!meter) throw new NotFoundException('کنتور یافت نشد');
      if (meter.marketId !== marketId) {
        throw new BadRequestException('کنتور باید متعلق به همان بازار باشد');
      }
    }

    const currency = await this.prisma.currency.findUnique({
      where: { id: dto.currencyId },
    });
    if (!currency) throw new NotFoundException('ارز مورد نظر یافت نشد');
    await ensureCurrencyEnabledForMarket(this.prisma, marketId, dto.currencyId);

    const totalAmount = new Prisma.Decimal(dto.totalAmount);

    return this.prisma.electricityBill.create({
      data: {
        marketId,
        shopId: dto.shopId,
        tenantId: dto.tenantId ?? null,
        meterId: dto.meterId ?? null,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        previousReading: dto.previousReading ?? null,
        currentReading: dto.currentReading ?? null,
        totalAmount,
        paidAmount: 0,
        remainingAmount: totalAmount,
        currencyId: dto.currencyId,
        status: ElectricityBillStatus.PENDING,
        isOpeningEntry: dto.isOpeningEntry ?? false,
        notes: dto.notes?.trim() || null,
        createdById: actor.id,
      },
    });
  }

  async findAllBills(
    currentUser: { id: string },
    query: ElectricityBillQueryDto,
  ) {
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

    const orderBy = resolveSort(
      query.sortBy,
      query.sortOrder,
      ElectricityService.BILL_SORT_FIELDS,
      { periodStart: 'desc' },
    );

    return paginate(this.prisma.electricityBill, {
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

  // ==========================================================================
  // تخصیص FIFO روی قدیمی‌ترین بل‌های بازِ یک مستأجر — عیناً الگوی RentService.
  // ==========================================================================
  private async allocateToBills(
    tx: Prisma.TransactionClient,
    tenantId: string,
    paymentId: string,
    amount: Prisma.Decimal,
  ) {
    const openBills = await tx.electricityBill.findMany({
      where: { tenantId, status: { in: OPEN_STATUSES } },
      orderBy: { periodStart: 'asc' },
    });

    const totalOutstanding = openBills.reduce(
      (s, b) => s.add(b.remainingAmount),
      new Prisma.Decimal(0),
    );
    if (amount.greaterThan(totalOutstanding)) {
      throw new BadRequestException(
        `مبلغ (${amount.toString()}) از مجموع بدهیِ بازِ برق این مستأجر (${totalOutstanding.toString()}) بیشتر است`,
      );
    }

    let remaining = amount;
    for (const bill of openBills) {
      if (remaining.isZero()) break;
      const applyAmount = Prisma.Decimal.min(remaining, bill.remainingAmount);

      await tx.electricityPaymentAllocation.create({
        data: { paymentId, billId: bill.id, amount: applyAmount },
      });

      const newPaid = bill.paidAmount.add(applyAmount);
      const newRemaining = bill.remainingAmount.sub(applyAmount);
      await tx.electricityBill.update({
        where: { id: bill.id },
        data: {
          paidAmount: newPaid,
          remainingAmount: newRemaining,
          status: newRemaining.lessThanOrEqualTo(0)
            ? ElectricityBillStatus.PAID
            : ElectricityBillStatus.PARTIAL,
        },
      });

      remaining = remaining.sub(applyAmount);
    }
  }

  // مجموع بدهی بازِ برق یک مستأجر روی یک دوکان مشخص — برای تسویهٔ قرارداد (ContractsService.settle)
  // لازم است چون ElectricityBill به‌جای contractId فقط tenantId/shopId دارد.
  async getOpenDebtForShop(
    tx: Prisma.TransactionClient,
    tenantId: string,
    shopId: string,
  ): Promise<Prisma.Decimal> {
    const openBills = await tx.electricityBill.findMany({
      where: { tenantId, shopId, status: { in: OPEN_STATUSES } },
    });
    return openBills.reduce(
      (s, b) => s.add(b.remainingAmount),
      new Prisma.Decimal(0),
    );
  }

  // بخشیدن (write-off) باقی‌ماندهٔ بل‌های باز یک مستأجر روی یک دوکان — بدون جابه‌جایی پول.
  // چون ElectricityBill ستون discountAmount ندارد، totalAmount را تا سطح paidAmount پایین
  // می‌آوریم (مبلغ نهایی واقعی) و دلیل را در notes ثبت می‌کنیم.
  async writeOffOpenBillsForShop(
    tx: Prisma.TransactionClient,
    tenantId: string,
    shopId: string,
    note: string,
  ) {
    const openBills = await tx.electricityBill.findMany({
      where: { tenantId, shopId, status: { in: OPEN_STATUSES } },
    });
    for (const bill of openBills) {
      await tx.electricityBill.update({
        where: { id: bill.id },
        data: {
          totalAmount: bill.paidAmount,
          remainingAmount: 0,
          status: ElectricityBillStatus.PAID,
          notes: bill.notes ? `${bill.notes}\n${note}` : note,
        },
      });
    }
    await this.recomputeElectricityDebt(tx, tenantId);
  }

  // خلاصهٔ سادهٔ بدهی برق هر مستأجر — ElectricityDebt فیلد status/overdueDebt ندارد،
  // فقط جمع بدهی و آخرین رویدادها را نگه می‌دارد.
  private async recomputeElectricityDebt(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ) {
    const openBills = await tx.electricityBill.findMany({
      where: { tenantId, status: { in: OPEN_STATUSES } },
    });
    const totalDebt = openBills.reduce(
      (s, b) => s.add(b.remainingAmount),
      new Prisma.Decimal(0),
    );
    const lastBill = openBills.sort(
      (a, b) => b.periodStart.getTime() - a.periodStart.getTime(),
    )[0];

    await tx.electricityDebt.upsert({
      where: { tenantId },
      create: {
        tenantId,
        totalDebt,
        lastBillAmount: lastBill?.totalAmount ?? 0,
        lastBillDate: lastBill?.periodStart ?? null,
      },
      update: {
        totalDebt,
        ...(lastBill
          ? {
              lastBillAmount: lastBill.totalAmount,
              lastBillDate: lastBill.periodStart,
            }
          : {}),
      },
    });
  }

  // ==========================================================================
  // ثبت یک پرداخت (موتور داخلی — هم از createPayment عمومی، هم از ContractsService
  // برای بخش نقدیِ تسویهٔ قرارداد صدا زده می‌شود، عیناً مثل RentService.recordPayment).
  // ==========================================================================
  async recordPayment(
    tx: Prisma.TransactionClient,
    actor: Actor,
    params: {
      marketId: string;
      shopId: string;
      tenantId: string;
      currencyId: string;
      amount: Prisma.Decimal;
      paymentDate: Date;
      paymentMethod: string;
      source: PaymentSourceType;
      accountId?: string | null;
      notes?: string | null;
      receiptNumber?: string | null;
      isOpeningEntry: boolean;
      securityDeposit?: {
        contractId: string;
        remaining: Prisma.Decimal;
      } | null;
    },
  ) {
    let accountBalanceAfter: Prisma.Decimal | null = null;

    if (params.source === PaymentSourceType.SECURITY_DEPOSIT) {
      if (!params.securityDeposit) {
        throw new BadRequestException(
          'قرارداد امانت برای این برداشت مشخص نشده است',
        );
      }
      if (params.amount.greaterThan(params.securityDeposit.remaining)) {
        throw new ConflictException(
          'مبلغ امانت باقی‌مانده برای این برداشت کافی نیست',
        );
      }
      await tx.contract.update({
        where: { id: params.securityDeposit.contractId },
        data: {
          securityDepositRemaining: params.securityDeposit.remaining.sub(
            params.amount,
          ),
        },
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

    const payment = await tx.electricityPayment.create({
      data: {
        marketId: params.marketId,
        shopId: params.shopId,
        tenantId: params.tenantId,
        amount: params.amount,
        currencyId: params.currencyId,
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

    await this.allocateToBills(tx, params.tenantId, payment.id, params.amount);

    if (
      params.source === PaymentSourceType.BANK &&
      !params.isOpeningEntry &&
      params.accountId
    ) {
      await tx.ledgerEntry.create({
        data: {
          marketId: params.marketId,
          accountId: params.accountId,
          currencyId: params.currencyId,
          direction: 'IN',
          amount: params.amount,
          balanceAfter: accountBalanceAfter!,
          entryDate: params.paymentDate,
          description: 'دریافت بل برق',
          electricityPaymentId: payment.id,
          createdById: actor.id,
        },
      });
    }

    await this.recomputeElectricityDebt(tx, params.tenantId);

    return payment;
  }

  async createPayment(
    currentUser: { id: string },
    dto: CreateElectricityPaymentDto,
  ) {
    const actor = await this.getActor(currentUser);

    const shop = await this.prisma.shop.findUnique({
      where: { id: dto.shopId },
    });
    if (!shop) throw new NotFoundException('دوکان یافت نشد');
    this.ensureAccess(actor, shop.marketId, 'دسترسی به این دوکان مجاز نیست');

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
    });
    if (!tenant) throw new NotFoundException('مستأجر یافت نشد');
    if (tenant.marketId !== shop.marketId) {
      throw new BadRequestException('مستأجر باید متعلق به همان بازار باشد');
    }

    const openBills = await this.prisma.electricityBill.findMany({
      where: { tenantId: dto.tenantId, status: { in: OPEN_STATUSES } },
      take: 1,
    });
    const currencyId = openBills[0]?.currencyId;
    if (!currencyId) {
      throw new BadRequestException('هیچ بل بازی برای این مستأجر وجود ندارد');
    }

    const source = dto.source ?? PaymentSourceType.BANK;
    let contract: {
      id: string;
      securityDepositRemaining: Prisma.Decimal | null;
    } | null = null;

    if (source === PaymentSourceType.SECURITY_DEPOSIT) {
      contract = await this.prisma.contract.findFirst({
        where: { tenantId: dto.tenantId, shopId: dto.shopId, status: 'active' },
        select: { id: true, securityDepositRemaining: true },
      });
      if (!contract) {
        throw new NotFoundException(
          'قرارداد فعالی برای این مستأجر/دوکان یافت نشد تا امانتش استفاده شود',
        );
      }
    } else {
      if (!dto.accountId) throw new BadRequestException('accountId الزامی است');
      const account = await this.prisma.account.findUnique({
        where: { id: dto.accountId },
      });
      if (!account) throw new NotFoundException('حساب یافت نشد');
      if (account.marketId !== shop.marketId) {
        throw new BadRequestException('حساب باید متعلق به همان بازار باشد');
      }
      if (account.currencyId !== currencyId) {
        throw new BadRequestException(
          'ارز حساب باید با ارز بل‌های برق یکی باشد',
        );
      }
    }

    const amount = new Prisma.Decimal(dto.amount);
    const paymentDate = dto.paymentDate
      ? new Date(dto.paymentDate)
      : new Date();

    return this.prisma.$transaction(async (tx) => {
      return this.recordPayment(tx, actor, {
        marketId: shop.marketId,
        shopId: dto.shopId,
        tenantId: dto.tenantId,
        currencyId,
        amount,
        paymentDate,
        paymentMethod: dto.paymentMethod ?? 'cash',
        source,
        accountId: dto.accountId,
        notes: dto.notes,
        receiptNumber: dto.receiptNumber,
        isOpeningEntry: false,
        securityDeposit: contract
          ? {
              contractId: contract.id,
              remaining:
                contract.securityDepositRemaining ?? new Prisma.Decimal(0),
            }
          : null,
      });
    });
  }

  async findAllPayments(
    currentUser: { id: string },
    query: ElectricityPaymentQueryDto,
  ) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }
    const where: any = {
      ...(actor.role === 'SUPER_ADMIN' ? {} : { marketId: actor.marketId! }),
    };
    if (query.shopId !== undefined) where.shopId = query.shopId;
    if (query.tenantId !== undefined) where.tenantId = query.tenantId;

    const orderBy = resolveSort(
      query.sortBy,
      query.sortOrder,
      ElectricityService.PAYMENT_SORT_FIELDS,
      { paymentDate: 'desc' },
    );

    return paginate(this.prisma.electricityPayment, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      include: {
        shop: { select: { id: true, shopNumber: true } },
        tenant: { select: { id: true, fullName: true } },
        allocations: true,
      },
    });
  }

  async findDebt(currentUser: { id: string }, tenantId: string) {
    const actor = await this.getActor(currentUser);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('مستأجر یافت نشد');
    this.ensureAccess(actor, tenant.marketId, 'دسترسی به این مستأجر مجاز نیست');

    const debt = await this.prisma.electricityDebt.findUnique({
      where: { tenantId },
    });
    return debt ?? { tenantId, totalDebt: new Prisma.Decimal(0) };
  }

  async findAllDebts(
    currentUser: { id: string },
    query: ElectricityDebtQueryDto,
  ) {
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

    return paginate(this.prisma.electricityDebt, {
      where,
      orderBy: { totalDebt: 'desc' },
      page: query.page,
      limit: query.limit,
      include: {
        tenant: { select: { id: true, fullName: true, marketId: true } },
      },
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async flagOverdueBills() {
    await this.prisma.electricityBill.updateMany({
      where: {
        status: ElectricityBillStatus.PENDING,
        periodEnd: { lt: new Date() },
      },
      data: { status: ElectricityBillStatus.OVERDUE },
    });
  }
}
