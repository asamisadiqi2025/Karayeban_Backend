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
import { jalaliMonthStart, jalaliMonthEnd } from '../../common/utils/jalali-date';
import { CreateElectricityBillDto } from './dto/create-electricity-bill.dto';
import { ElectricityBillQueryDto } from './dto/electricity-bill-query.dto';
import { CreateElectricityPaymentDto } from './dto/create-electricity-payment.dto';
import { ElectricityPaymentQueryDto } from './dto/electricity-payment-query.dto';
import { ElectricityDebtQueryDto } from './dto/electricity-debt-query.dto';
import { CreateElectricityBillingCycleDto } from './dto/create-electricity-billing-cycle.dto';
import { ElectricityBillingCycleQueryDto } from './dto/electricity-billing-cycle-query.dto';
import { CreateElectricityBillsBulkDto } from './dto/create-electricity-bills-bulk.dto';
import { CreateElectricityPaymentsBulkDto } from './dto/create-electricity-payments-bulk.dto';
import { ElectricityDebtAgingQueryDto } from './dto/electricity-debt-aging-query.dto';

type Actor = { id: string; role: string; marketId: string | null };

// export می‌شود چون ContractsService هم برای پیدا کردن ارزِ بل‌های بازِ یک مستأجر
// (پرداخت ترکیبی کرایه+برق) به همین لیست وضعیت‌ها نیاز دارد.
export const ELECTRICITY_OPEN_STATUSES: ElectricityBillStatus[] = [
  ElectricityBillStatus.PENDING,
  ElectricityBillStatus.PARTIAL,
  ElectricityBillStatus.OVERDUE,
];
const OPEN_STATUSES = ELECTRICITY_OPEN_STATUSES;

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
  // دوره‌بندی میترخوانی — هر بازار/سال شمسی مستقل تنظیم می‌شود (۱۲/monthsPerPeriod دوره).
  // ==========================================================================
  async setBillingCycle(
    currentUser: { id: string },
    dto: CreateElectricityBillingCycleDto,
  ) {
    const actor = await this.getActor(currentUser);
    const marketId = this.resolveMarketId(actor, dto.marketId);
    await ensureMarketSetupComplete(this.prisma, marketId);

    const existing = await this.prisma.electricityBillingCycle.findUnique({
      where: { marketId_year: { marketId, year: dto.year } },
    });

    if (existing && existing.monthsPerPeriod !== dto.monthsPerPeriod) {
      const billCount = await this.prisma.electricityBill.count({
        where: { billingCycleId: existing.id },
      });
      if (billCount > 0) {
        throw new ConflictException(
          `برای سال ${dto.year} این بازار قبلاً ${billCount} بل ثبت شده؛ چون تغییر طول دوره دوره‌های موجود را نامعتبر می‌کند، ابتدا باید آن بل‌ها بررسی شوند`,
        );
      }
    }

    return this.prisma.electricityBillingCycle.upsert({
      where: { marketId_year: { marketId, year: dto.year } },
      create: {
        marketId,
        year: dto.year,
        monthsPerPeriod: dto.monthsPerPeriod,
      },
      update: { monthsPerPeriod: dto.monthsPerPeriod },
    });
  }

  async findBillingCycles(
    currentUser: { id: string },
    query: ElectricityBillingCycleQueryDto,
  ) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }
    const where: any = {
      ...(actor.role === 'SUPER_ADMIN'
        ? query.marketId
          ? { marketId: query.marketId }
          : {}
        : { marketId: actor.marketId! }),
    };
    if (query.year !== undefined) where.year = query.year;

    return this.prisma.electricityBillingCycle.findMany({
      where,
      orderBy: { year: 'desc' },
    });
  }

  // periodStart/periodEnd هر بل از اینجا محاسبه می‌شود، نه آزاد از فرانت — طبق
  // ElectricityBillingCycle تنظیم‌شدهٔ همان بازار/سال. اگر هنوز تنظیم نشده، خطای واضح می‌دهد
  // تا حسابدار اول setBillingCycle را صدا بزند.
  private async resolvePeriod(marketId: string, year: number, periodNumber: number) {
    const cycle = await this.prisma.electricityBillingCycle.findUnique({
      where: { marketId_year: { marketId, year } },
    });
    if (!cycle) {
      throw new BadRequestException(
        `دوره‌بندی میترخوانی سال ${year} برای این بازار هنوز تنظیم نشده؛ ابتدا آن را تنظیم کنید`,
      );
    }

    const periodsPerYear = 12 / cycle.monthsPerPeriod;
    if (periodNumber < 1 || periodNumber > periodsPerYear) {
      throw new BadRequestException(
        `شمارهٔ دوره باید بین ۱ و ${periodsPerYear} باشد (این بازار در سال ${year}، ${periodsPerYear} دوره دارد)`,
      );
    }

    const startMonth = (periodNumber - 1) * cycle.monthsPerPeriod + 1;
    const endMonth = periodNumber * cycle.monthsPerPeriod;

    return {
      cycle,
      periodStart: jalaliMonthStart(year, startMonth),
      periodEnd: jalaliMonthEnd(year, endMonth),
    };
  }

  // ==========================================================================
  // بل‌ها — ثبت دستی (نه تولید خودکار)، همیشه بر مبنای دوره‌ی محاسبه‌شدهٔ قرارداد.
  // ==========================================================================
  async createBill(currentUser: { id: string }, dto: CreateElectricityBillDto) {
    const actor = await this.getActor(currentUser);

    const contract = await this.prisma.contract.findUnique({
      where: { id: dto.contractId },
    });
    if (!contract) throw new NotFoundException('قرارداد یافت نشد');
    if (!contract.shopId || !contract.tenantId) {
      throw new BadRequestException(
        'این قرارداد دوکان یا مستأجر مشخصی ندارد و نمی‌تواند بل برق داشته باشد',
      );
    }
    this.ensureAccess(actor, contract.marketId, 'دسترسی به این قرارداد مجاز نیست');
    const marketId = contract.marketId;

    await ensureMarketSetupComplete(this.prisma, marketId);

    const isOpeningEntry = dto.isOpeningEntry ?? false;

    // برای بل‌های زنده، کنتور اجباری است — درجهٔ قبلی از meter.lastReading خوانده می‌شود
    // (نه از ورودی آزاد کاربر) تا مبلغ همیشه از روی مصرفِ واقعی محاسبه شود، نه تایپِ دستی.
    let meter: {
      id: string;
      marketId: string;
      lastReading: Prisma.Decimal | null;
    } | null = null;
    if (dto.meterId) {
      meter = await this.prisma.electricityMeter.findUnique({
        where: { id: dto.meterId },
      });
      if (!meter) throw new NotFoundException('کنتور یافت نشد');
      if (meter.marketId !== marketId) {
        throw new BadRequestException('کنتور باید متعلق به همان بازار باشد');
      }
    } else if (!isOpeningEntry) {
      throw new BadRequestException(
        'meterId برای بل‌های زنده الزامی است (درجهٔ قبلی از روی آن خوانده می‌شود)',
      );
    }

    if (!isOpeningEntry && dto.currentReading === undefined) {
      throw new BadRequestException('currentReading برای بل‌های زنده الزامی است');
    }

    const currency = await this.prisma.currency.findUnique({
      where: { id: dto.currencyId },
    });
    if (!currency) throw new NotFoundException('ارز مورد نظر یافت نشد');
    await ensureCurrencyEnabledForMarket(this.prisma, marketId, dto.currencyId);

    if (dto.paidAmount !== undefined && !isOpeningEntry) {
      throw new BadRequestException(
        'paidAmount فقط برای بل‌های مهاجرت‌شده (isOpeningEntry) قابل تنظیم است؛ برای بل‌های زنده از ثبت پرداخت استفاده کنید',
      );
    }

    const {
      cycle,
      periodStart,
      periodEnd: naturalPeriodEnd,
    } = await this.resolvePeriod(marketId, dto.year, dto.periodNumber);

    // readingDate: برای قرائتِ نهاییِ روزِ فسخ/تحویل دوکان — بل دقیقاً تا همین تاریخ
    // بسته می‌شود، نه تا پایانِ طبیعیِ دوره. باید داخل خودِ دوره باشد، نه قبل/بعدش.
    let periodEnd = naturalPeriodEnd;
    if (dto.readingDate !== undefined) {
      const readingDate = new Date(dto.readingDate);
      if (readingDate < periodStart || readingDate > naturalPeriodEnd) {
        throw new BadRequestException(
          `readingDate باید داخل دورهٔ ${dto.periodNumber} (بین ${periodStart.toISOString().slice(0, 10)} و ${naturalPeriodEnd.toISOString().slice(0, 10)}) باشد`,
        );
      }
      periodEnd = readingDate;
    }

    // previousReading: override دستی اگر فرستاده شده، وگرنه از خودِ کنتور.
    let previousReading: Prisma.Decimal | null =
      dto.previousReading !== undefined
        ? new Prisma.Decimal(dto.previousReading)
        : (meter?.lastReading ?? null);
    let currentReading: Prisma.Decimal | null =
      dto.currentReading !== undefined ? new Prisma.Decimal(dto.currentReading) : null;

    let totalAmount: Prisma.Decimal;
    if (dto.totalAmount !== undefined) {
      // override دستی — همیشه مجاز (تخفیف خاص، توافق دستی، یا isOpeningEntry).
      totalAmount = new Prisma.Decimal(dto.totalAmount);
    } else {
      if (isOpeningEntry) {
        throw new BadRequestException(
          'totalAmount برای بل‌های تاریخی (isOpeningEntry) الزامی است',
        );
      }
      if (!previousReading) previousReading = new Prisma.Decimal(0);
      if (currentReading!.lessThan(previousReading)) {
        throw new BadRequestException(
          `درجهٔ فعلی (${currentReading!.toString()}) نمی‌تواند از درجهٔ قبلی (${previousReading.toString()}) کمتر باشد — اگر کنتور تعویض شده، اول از merge کنتور استفاده کنید`,
        );
      }
      const market = await this.prisma.market.findUnique({
        where: { id: marketId },
        select: { electricityRatePerUnit: true },
      });
      const consumption = currentReading!.sub(previousReading);
      totalAmount = consumption.mul(market!.electricityRatePerUnit);
    }

    const paidAmount = new Prisma.Decimal(dto.paidAmount ?? 0);
    if (paidAmount.greaterThan(totalAmount)) {
      throw new BadRequestException('paidAmount نمی‌تواند از totalAmount بیشتر باشد');
    }
    const remainingAmount = totalAmount.sub(paidAmount);
    const status = remainingAmount.lessThanOrEqualTo(0)
      ? ElectricityBillStatus.PAID
      : paidAmount.greaterThan(0)
        ? ElectricityBillStatus.PARTIAL
        : ElectricityBillStatus.PENDING;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const bill = await tx.electricityBill.create({
          data: {
            marketId,
            shopId: contract.shopId!,
            tenantId: contract.tenantId!,
            contractId: contract.id,
            meterId: dto.meterId ?? null,
            billingCycleId: cycle.id,
            year: dto.year,
            periodNumber: dto.periodNumber,
            periodStart,
            periodEnd,
            previousReading,
            currentReading,
            totalAmount,
            paidAmount,
            remainingAmount,
            currencyId: dto.currencyId,
            status,
            isOpeningEntry,
            notes: dto.notes?.trim() || null,
            createdById: actor.id,
          },
        });

        // کنتور همیشه باید درجهٔ آخرین چیزی که ثبت شده را نشان دهد — چه بل زنده چه
        // opening-entryِ تاریخی‌ای که رقم واقعی کنتور را هم داشته (تا وقتی به اولین بل
        // زنده می‌رسیم، previousReading درست باشد). فقط رو به جلو حرکت می‌کند — یک
        // opening-entry که نامرتب/عقب‌تر وارد شود، رقم جدیدتر را عقب نمی‌برد.
        if (
          meter &&
          currentReading &&
          (!meter.lastReading || currentReading.greaterThan(meter.lastReading))
        ) {
          await tx.electricityMeter.update({
            where: { id: meter.id },
            data: { lastReading: currentReading, lastReadingDate: periodEnd },
          });
        }

        await this.recomputeElectricityDebt(tx, contract.tenantId!);

        return bill;
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException(
          `برای این قرارداد، سال ${dto.year} و دورهٔ ${dto.periodNumber} قبلاً بل ثبت شده است`,
        );
      }
      throw e;
    }
  }

  // یک دور میترخوانی که چند دوکان را پوشش می‌دهد — هر آیتم با تراکنش خودش (createBill)
  // مستقل پردازش می‌شود تا خطای یک دوکان (مثلاً دورهٔ تکراری) بقیه را متوقف نکند؛ حسابدار
  // فقط همان یکی را در failed می‌بیند و دوباره می‌فرستد.
  async createBillsBulk(
    currentUser: { id: string },
    dto: CreateElectricityBillsBulkDto,
  ) {
    const created: Awaited<ReturnType<ElectricityService['createBill']>>[] = [];
    const failed: { index: number; error: string }[] = [];

    for (let i = 0; i < dto.bills.length; i++) {
      try {
        created.push(await this.createBill(currentUser, dto.bills[i]));
      } catch (e: any) {
        failed.push({ index: i, error: e?.message ?? 'خطای ناشناخته' });
      }
    }

    return { created, failed };
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
        meter: { select: { id: true, meterNumber: true, serialNumber: true } },
      },
    });
  }

  // ==========================================================================
  // تخصیص FIFO روی قدیمی‌ترین بل‌های بازِ یک مستأجر — عیناً الگوی RentService.
  // ==========================================================================
  // مقیدشده به (tenantId, shopId) — نه فقط tenantId — چون یک مستأجر می‌تواند چند قرارداد/
  // دوکان داشته باشد؛ پرداختِ ثبت‌شده برای یک دوکان نباید بدهیِ دوکان دیگرِ همان مستأجر را
  // لمس کند. (getOpenDebtForShop از قبل همین‌طور بود؛ اینجا قبلاً هماهنگ نبود.)
  private async allocateToBills(
    tx: Prisma.TransactionClient,
    tenantId: string,
    shopId: string,
    paymentId: string,
    amount: Prisma.Decimal,
  ) {
    const openBills = await tx.electricityBill.findMany({
      where: { tenantId, shopId, status: { in: OPEN_STATUSES } },
      orderBy: { periodStart: 'asc' },
    });

    const totalOutstanding = openBills.reduce(
      (s, b) => s.add(b.remainingAmount),
      new Prisma.Decimal(0),
    );
    if (amount.greaterThan(totalOutstanding)) {
      throw new BadRequestException(
        `مبلغ (${amount.toString()}) از مجموع بدهیِ بازِ برقِ این دوکان (${totalOutstanding.toString()}) بیشتر است`,
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

  // تخصیصِ هدفمند روی یک بلِ مشخص — برای وقتی حسابدار از داخل اکانت مستأجر یک دورهٔ
  // به‌خصوص را انتخاب می‌کند (نه FIFO خودکار). عمداً سرریز نمی‌کند: اگر مبلغ از باقی‌ماندهٔ
  // همین بل بیشتر باشد رد می‌شود، تا معلوم باشد اضافه‌اش قرار است کجا برود.
  private async allocateToSpecificBill(
    tx: Prisma.TransactionClient,
    bill: {
      id: string;
      paidAmount: Prisma.Decimal;
      remainingAmount: Prisma.Decimal;
    },
    paymentId: string,
    amount: Prisma.Decimal,
  ) {
    if (amount.greaterThan(bill.remainingAmount)) {
      throw new BadRequestException(
        `مبلغ (${amount.toString()}) از باقی‌ماندهٔ همین بل (${bill.remainingAmount.toString()}) بیشتر است — برای پرداخت روی چند دوره، billId را خالی بگذارید تا خودکار (FIFO) تقسیم شود`,
      );
    }

    await tx.electricityPaymentAllocation.create({
      data: { paymentId, billId: bill.id, amount },
    });

    const newPaid = bill.paidAmount.add(amount);
    const newRemaining = bill.remainingAmount.sub(amount);
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
      // اگر داده شود، پرداخت فقط روی همین یک بل می‌نشیند (نه FIFO روی همهٔ بل‌های باز).
      billId?: string | null;
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

    if (params.billId) {
      const bill = await tx.electricityBill.findUnique({
        where: { id: params.billId },
      });
      if (!bill) throw new NotFoundException('بل یافت نشد');
      if (bill.tenantId !== params.tenantId) {
        throw new BadRequestException('این بل متعلق به این مستأجر نیست');
      }
      if (!OPEN_STATUSES.includes(bill.status)) {
        throw new BadRequestException(
          'این بل قبلاً کامل پرداخت شده یا لغو شده است',
        );
      }
      await this.allocateToSpecificBill(tx, bill, payment.id, params.amount);
    } else {
      await this.allocateToBills(
        tx,
        params.tenantId,
        params.shopId,
        payment.id,
        params.amount,
      );
    }

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

    let currencyId: string;
    if (dto.billId) {
      const targetBill = await this.prisma.electricityBill.findUnique({
        where: { id: dto.billId },
      });
      if (!targetBill) throw new NotFoundException('بل یافت نشد');
      if (targetBill.tenantId !== dto.tenantId || targetBill.shopId !== dto.shopId) {
        throw new BadRequestException('این بل متعلق به این مستأجر/دوکان نیست');
      }
      if (!OPEN_STATUSES.includes(targetBill.status)) {
        throw new BadRequestException(
          'این بل قبلاً کامل پرداخت شده یا لغو شده است',
        );
      }
      currencyId = targetBill.currencyId;
    } else {
      // مقیدشده به همین دوکان هم — وگرنه اگر مستأجر چند دوکان داشته باشد، ممکن است ارزِ
      // یک بلِ باز از دوکان دیگرش برداشته شود.
      const openBills = await this.prisma.electricityBill.findMany({
        where: {
          tenantId: dto.tenantId,
          shopId: dto.shopId,
          status: { in: OPEN_STATUSES },
        },
        take: 1,
      });
      if (!openBills[0]) {
        throw new BadRequestException('هیچ بل بازی برای این دوکان وجود ندارد');
      }
      currencyId = openBills[0].currencyId;
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
        billId: dto.billId,
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

  // روز جمع‌آوری نقدی که چند رسید یک‌جا وارد می‌شود — همان الگوی createBillsBulk:
  // هر پرداخت مستقل (createPayment) پردازش می‌شود، یک خطا بقیه را متوقف نمی‌کند.
  async createPaymentsBulk(
    currentUser: { id: string },
    dto: CreateElectricityPaymentsBulkDto,
  ) {
    const created: Awaited<ReturnType<ElectricityService['createPayment']>>[] =
      [];
    const failed: { index: number; error: string }[] = [];

    for (let i = 0; i < dto.payments.length; i++) {
      try {
        created.push(await this.createPayment(currentUser, dto.payments[i]));
      } catch (e: any) {
        failed.push({ index: i, error: e?.message ?? 'خطای ناشناخته' });
      }
    }

    return { created, failed };
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

  private static readonly AGING_BUCKETS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'] as const;

  private static bucketForPeriodEnd(
    periodEnd: Date,
    now: Date,
  ): (typeof ElectricityService.AGING_BUCKETS)[number] {
    if (periodEnd >= now) return 'current';
    const daysOverdue = Math.floor((now.getTime() - periodEnd.getTime()) / (1000 * 60 * 60 * 24));
    if (daysOverdue <= 30) return 'd1_30';
    if (daysOverdue <= 60) return 'd31_60';
    if (daysOverdue <= 90) return 'd61_90';
    return 'd90_plus';
  }

  // رده‌بندیِ سنیِ بدهیِ بازِ برق — عیناً همان الگوی RentService.getDebtAging (فقط روی
  // ElectricityBill به‌جای RentCharges): findAllDebts می‌گوید «کدام مستأجر چقدر بدهکار
  // است»، این می‌گوید «بدهیِ کل بازار از نظرِ قدمت چطور پخش شده».
  //
  // چرا fetch+bucket در حافظه، نه groupBy در دیتابیس: Prisma نمی‌تواند «امروز منهای
  // periodEnd» را در سطحِ خودِ groupBy دسته‌بندی کند (نه CASE، نه date-diff). راهِ جایگزین
  // یک $queryRaw با CASE WHEN بود، اما آن هم برای همین حجمِ داده سودی نداشت — مقیاس‌پذیریِ
  // این کوئری وابسته به تعدادِ کلِ رویدادهای مالیِ گذشته نیست (که می‌تواند خیلی بزرگ شود)،
  // بلکه فقط به تعدادِ بل‌های همین‌الان بازِ یک بازار (status IN PENDING/PARTIAL/OVERDUE)
  // بستگی دارد — که به‌طورِ طبیعی به تعدادِ دوکان‌های آن بازار محدود است (چون هر دوکان در
  // هر دوره حداکثر یک بلِ باز دارد)، نه به کلِ تاریخچه. برای صدها/چندهزار دوکان هم این
  // fetch سبک می‌ماند؛ اگر یک‌روز این فرض عوض شود (مثلاً بازارهای خیلی بزرگ‌تر)، اول قدم
  // اضافه‌کردنِ یک ایندکس روی (marketId, status) است، نه بازنویسیِ کل منطق.
  async getDebtAging(currentUser: { id: string }, query: ElectricityDebtAgingQueryDto) {
    const actor = await this.getActor(currentUser);
    const marketId = this.resolveMarketId(actor, query.marketId);

    const openBills = await this.prisma.electricityBill.findMany({
      where: { marketId, status: { in: OPEN_STATUSES }, remainingAmount: { gt: 0 } },
      select: { remainingAmount: true, currencyId: true, periodEnd: true },
    });

    const currencyIds = [...new Set(openBills.map((b) => b.currencyId))];
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
        ElectricityService.AGING_BUCKETS.map((b) => [b, { amount: zero, count: 0 }]),
      ) as Record<(typeof ElectricityService.AGING_BUCKETS)[number], { amount: Prisma.Decimal; count: number }>;

    const byCurrency = new Map<
      string,
      {
        currencyId: string;
        currencyCode: string | null;
        buckets: ReturnType<typeof zeroBuckets>;
        totalAmount: Prisma.Decimal;
        totalCount: number;
      }
    >();

    for (const bill of openBills) {
      const bucket = ElectricityService.bucketForPeriodEnd(bill.periodEnd, now);
      const entry = byCurrency.get(bill.currencyId) ?? {
        currencyId: bill.currencyId,
        currencyCode: currencyCodeById.get(bill.currencyId) ?? null,
        buckets: zeroBuckets(),
        totalAmount: zero,
        totalCount: 0,
      };
      entry.buckets[bucket].amount = entry.buckets[bucket].amount.add(bill.remainingAmount);
      entry.buckets[bucket].count += 1;
      entry.totalAmount = entry.totalAmount.add(bill.remainingAmount);
      entry.totalCount += 1;
      byCurrency.set(bill.currencyId, entry);
    }

    return {
      marketId,
      asOf: now.toISOString(),
      byCurrency: [...byCurrency.values()],
    };
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
