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
import {
  paginate,
  resolveSort,
  buildSearchWhere,
} from '../../common/utils/pagination';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { ContractQueryDto } from './dto/contract-query.dto';
import { TerminateContractDto } from './dto/terminate-contract.dto';
import { SettleContractDto } from './dto/settle-contract.dto';
import { CancelContractDto } from './dto/cancel-contract.dto';
import { RenewContractDto } from './dto/renew-contract.dto';
import { PayContractDebtDto } from './dto/pay-contract-debt.dto';

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
  // ساخت قرارداد — هم برای دوکان خالیِ تازه‌اجاره‌شده، هم برای مهاجرت قراردادی که از
  // قبل (مثلاً ۵ ماه) در حال جریان است. تفاوتشان فقط startDate و openingRentPaid است؛
  // بقیهٔ منطق (تولید فاکتور، FIFO) دقیقاً یکسان است.
  // ==========================================================================
  async create(currentUser: { id: string }, dto: CreateContractDto) {
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

      await tx.shop.update({
        where: { id: dto.shopId },
        data: {
          status: isStarted ? 'rented' : 'pending',
          currentContractId: contract.id,
          currentTenantId: dto.tenantId,
        },
      });

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
            entryDate: now,
            description: `امانت (پیش‌پرداخت) قرارداد دوکان «${shop.shopNumber}»`,
            createdById: actor.id,
          },
        });
      }

      if (dto.openingRentPaid) {
        await this.rentService.recordPayment(tx, actor, {
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
        });
      }

      return tx.contract.findUniqueOrThrow({ where: { id: contract.id } });
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

    return this.prisma.contract.update({ where: { id }, data });
  }

  // ==========================================================================
  // فسخ زودهنگام — فاکتور دورهٔ دربرگیرنده با فرمول روزانه اصلاح می‌شود،
  // فاکتورهای آیندهٔ نرسیده لغو می‌شوند، دوکان آزاد می‌شود.
  // ==========================================================================
  async terminate(
    currentUser: { id: string },
    id: string,
    dto: TerminateContractDto,
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

    return this.prisma.$transaction(async (tx) => {
      const spanningCharge = await tx.rentCharges.findFirst({
        where: {
          contractId: id,
          periodStart: { lte: terminationDate },
          periodEnd: { gt: terminationDate },
        },
      });

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

      return tx.contract.findUniqueOrThrow({ where: { id } });
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

      return updatedContract;
    });
  }

  // ==========================================================================
  // تمدید — قرارداد فعلی را می‌بندد (expired) و بلافاصله از همان روزی که تمام
  // می‌شود یک قرارداد جدیِ پیوسته می‌سازد (دوکان هرگز «خالی» نمی‌شود). بدهیِ کرایه/برقِ
  // باقی‌مانده کاری لازم ندارد چون RentDebt/ElectricityDebt بر مبنای tenantId (نه
  // contractId) جمع می‌شوند — زیر قرارداد جدید هم خودکار همان بدهی دیده می‌شود.
  // امانت (securityDeposit) به قرارداد جدید منتقل می‌شود تا دوباره‌شمار نشود.
  // ==========================================================================
  async renew(currentUser: { id: string }, id: string, dto: RenewContractDto) {
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

    return this.prisma.$transaction(async (tx) => {
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
          status: ContractStatus.active,
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
            status: 'rented',
            currentContractId: newContract.id,
            currentTenantId: contract.tenantId,
          },
        });
      } else {
        await tx.shop.update({
          where: { id: newShopId },
          data: {
            status: 'rented',
            currentContractId: newContract.id,
            currentTenantId: contract.tenantId,
          },
        });
      }

      return tx.contract.findUniqueOrThrow({ where: { id: newContract.id } });
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
        await this.rentService.recordPayment(tx, actor, {
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
        });
      }
      if (cashForElectricity.greaterThan(0)) {
        await this.electricityService.recordPayment(tx, actor, {
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
        });
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

      return tx.contractSettlement.create({
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
    });
  }

  // پرداخت ترکیبیِ کرایه + برق، از یک حساب، در یک تراکنش — برای وقتی که مستأجر یک پرداخت
  // نقدی می‌آورد که هم کرایه و هم برق را پوشش می‌دهد؛ به‌جای دو بار مراجعه به
  // POST /rent/payments و POST /electricity/payments جدا. rentAmount با ارزِ خودِ قرارداد
  // پرداخت می‌شود؛ electricityAmount با ارزِ بل‌های بازِ همین مستأجر (ممکن است با ارز
  // قرارداد فرق کند) — اگر یک accountId نتواند هر دو ارز را پوشش دهد، خطای واضح می‌دهد
  // تا آن بخش را جدا (از /electricity/payments) پرداخت کنند.
  async payDebt(
    currentUser: { id: string },
    id: string,
    dto: PayContractDebtDto,
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

    return this.prisma.$transaction(async (tx) => {
      const result: {
        rentPayment: Awaited<ReturnType<RentService['recordPayment']>> | null;
        electricityPayment:
          | Awaited<ReturnType<ElectricityService['recordPayment']>>
          | null;
      } = { rentPayment: null, electricityPayment: null };

      if (rentAmount.greaterThan(0)) {
        result.rentPayment = await this.rentService.recordPayment(tx, actor, {
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
        });
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

        result.electricityPayment =
          await this.electricityService.recordPayment(tx, actor, {
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
          });
      }

      return result;
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
}
