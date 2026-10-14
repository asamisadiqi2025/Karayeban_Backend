import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ElectricityBillStatus, Prisma, RentChargeStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ensureMarketSetupComplete } from '../../common/utils/ensure-market-setup-complete';
import { paginate, resolveSort, buildSearchWhere } from '../../common/utils/pagination';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantQueryDto } from './dto/tenant-query.dto';
import { TenantStatementQueryDto } from './dto/tenant-statement-query.dto';
import { RENT_OPEN_STATUSES } from '../rent/rent.service';
import { ELECTRICITY_OPEN_STATUSES } from '../electricity/electricity.service';
import { UploadsService } from '../uploads/uploads.service';
import {
  buildCurrencyStatements,
  combineOpeningBalances,
  electricityBillEvent,
  electricityPaymentEvent,
  legacyTopLevel,
  rentChargeEvent,
  rentPaymentEvent,
  resolveStatementRange,
} from './tenant-statement.builder';

type Actor = { id: string; role: string; marketId: string | null };

@Injectable()
export class TenantsService {
  private static readonly SORT_FIELDS = ['fullName', 'createdAt'] as const;
  private static readonly SEARCH_FIELDS = [
    'fullName',
    'fatherName',
    'grandfatherName',
    'idNumber',
    'contact',
  ] as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadsService: UploadsService,
  ) {}

  // JWT در حال حاضر marketId را حمل نمی‌کند، پس همیشه از دیتابیس تازه خوانده می‌شود.
  private async getActor(currentUser: { id: string }): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, role: true, marketId: true },
    });
    if (!user) throw new ForbiddenException('کاربر معتبر نیست');
    return user;
  }

  private ensureAccess(actor: Actor, tenantMarketId: string) {
    if (actor.role === 'SUPER_ADMIN') return;
    if (actor.marketId !== tenantMarketId) {
      throw new ForbiddenException('دسترسی به این مستأجر مجاز نیست');
    }
  }

  // همان درسی که برای Guarantor گرفتیم: به‌جای پیام مبهم، خودِ مستأجرِ از‌قبل‌ثبت‌شده
  // را معرفی می‌کنیم. با @prisma/adapter-pg فیلدهای قید نقض‌شده زیر driverAdapterError
  // می‌آیند، نه target کلاسیک — هر دو شکل را چک می‌کنیم.
  private async handleIdNumberConflict(
    e: any,
    marketId: string,
    idNumber: string | undefined,
  ): Promise<never> {
    const adapterFields: string[] = e.meta?.driverAdapterError?.cause?.constraint?.fields ?? [];
    const classicTarget = e.meta?.target;
    const classicFields: string[] = Array.isArray(classicTarget)
      ? classicTarget
      : typeof classicTarget === 'string'
        ? [classicTarget]
        : [];
    const fields = [...adapterFields, ...classicFields];

    if (fields.includes('id_number') && idNumber) {
      const existing = await this.prisma.tenant.findFirst({
        where: { marketId, idNumber },
        select: { id: true, fullName: true },
      });
      throw new ConflictException(
        existing
          ? `مستأجری با شمارهٔ تذکرهٔ «${idNumber}» قبلاً با نام «${existing.fullName}» ثبت شده (شناسه: ${existing.id}) — به‌جای ساختن رکورد جدید، از همان مستأجر استفاده کنید`
          : `شمارهٔ تذکرهٔ «${idNumber}» در این بازار قبلاً ثبت شده است`,
      );
    }
    throw new ConflictException('این مقدار در این بازار از قبل ثبت شده است');
  }

  async create(currentUser: { id: string }, dto: CreateTenantDto) {
    const actor = await this.getActor(currentUser);

    let marketId: string;
    if (actor.role === 'SUPER_ADMIN') {
      if (!dto.marketId) {
        throw new BadRequestException('برای سوپر ادمین، marketId الزامی است');
      }
      marketId = dto.marketId;
    } else {
      if (!actor.marketId) {
        throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
      }
      marketId = actor.marketId;
    }

    await ensureMarketSetupComplete(this.prisma, marketId);

    const idNumber = dto.idNumber?.trim() || undefined;

    try {
      return await this.prisma.tenant.create({
        data: {
          marketId,
          fullName: dto.fullName.trim(),
          fatherName: dto.fatherName?.trim() || null,
          grandfatherName: dto.grandfatherName?.trim() || null,
          idNumber: idNumber ?? null,
          contact: dto.contact?.trim() || null,
          gender: dto.gender,
          details: dto.details?.trim() || null,
          photo: dto.photo?.trim() || null,
        },
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        await this.handleIdNumberConflict(e, marketId, idNumber);
      }
      throw e;
    }
  }

  async findAll(currentUser: { id: string }, query: TenantQueryDto) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }
    const where: any =
      actor.role === 'SUPER_ADMIN' ? {} : { marketId: actor.marketId! };

    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.gender !== undefined) where.gender = query.gender;

    const searchWhere = buildSearchWhere(TenantsService.SEARCH_FIELDS, query.search);
    if (searchWhere) where.AND = [searchWhere];

    const orderBy = resolveSort(query.sortBy, query.sortOrder, TenantsService.SORT_FIELDS, {
      fullName: 'asc',
    });

    return paginate(this.prisma.tenant, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
    });
  }

  async findOne(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('مستأجر یافت نشد');
    this.ensureAccess(actor, tenant.marketId);
    return tenant;
  }

  async update(currentUser: { id: string }, id: string, dto: UpdateTenantDto) {
    const actor = await this.getActor(currentUser);
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('مستأجر یافت نشد');
    this.ensureAccess(actor, tenant.marketId);

    const data: Record<string, unknown> = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName.trim();
    if (dto.fatherName !== undefined) data.fatherName = dto.fatherName?.trim() || null;
    if (dto.grandfatherName !== undefined)
      data.grandfatherName = dto.grandfatherName?.trim() || null;
    if (dto.idNumber !== undefined) data.idNumber = dto.idNumber?.trim() || null;
    if (dto.contact !== undefined) data.contact = dto.contact?.trim() || null;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.details !== undefined) data.details = dto.details?.trim() || null;
    if (dto.photo !== undefined) {
      const newPhoto = dto.photo?.trim() || null;
      if (newPhoto !== tenant.photo) {
        await this.uploadsService.deleteByUrl(tenant.photo);
      }
      data.photo = newPhoto;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      return await this.prisma.tenant.update({ where: { id }, data });
    } catch (e: any) {
      if (e.code === 'P2002') {
        await this.handleIdNumberConflict(e, tenant.marketId, dto.idNumber?.trim());
      }
      throw e;
    }
  }

  async remove(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('مستأجر یافت نشد');
    this.ensureAccess(actor, tenant.marketId);

    const [
      contractsCount,
      rentChargesCount,
      rentPaymentsCount,
      currentShopsCount,
      electricityBillsCount,
      electricityPaymentsCount,
      collateralItemsCount,
    ] = await Promise.all([
      this.prisma.contract.count({ where: { tenantId: id } }),
      this.prisma.rentCharges.count({ where: { tenantId: id } }),
      this.prisma.rentPayment.count({ where: { tenantId: id } }),
      this.prisma.shop.count({ where: { currentTenantId: id } }),
      this.prisma.electricityBill.count({ where: { tenantId: id } }),
      this.prisma.electricityPayment.count({ where: { tenantId: id } }),
      this.prisma.collateralItem.count({ where: { tenantId: id } }),
    ]);

    const hasRelations =
      contractsCount > 0 ||
      rentChargesCount > 0 ||
      rentPaymentsCount > 0 ||
      currentShopsCount > 0 ||
      electricityBillsCount > 0 ||
      electricityPaymentsCount > 0 ||
      collateralItemsCount > 0;

    if (hasRelations) {
      throw new ConflictException(
        'این مستأجر دارای قرارداد یا سابقهٔ تراکنش است و قابل حذف نیست؛ در عوض می‌توانید آن را غیرفعال کنید',
      );
    }

    await this.prisma.tenant.delete({ where: { id } });
    await this.uploadsService.deleteByUrl(tenant.photo);
    return { message: `مستأجر «${tenant.fullName}» حذف شد` };
  }

  // ==========================================================================
  // استیتمنتِ کاملِ مستأجر — کرایه + برقِ همهٔ قراردادهایش (نه فقط یکی) با هم، به‌ترتیبِ
  // تاریخ، با موجودیِ تجمیعی. همان اصلِ AccountsService.getStatement: موجودی را از رویدادهای
  // خام بازمحاسبه می‌کنیم، نه از یک فیلدِ ذخیره‌شده (تاریخِ فاکتور/پرداخت می‌تواند گذشته‌نگر باشد).
  // منطقِ خالصِ ساختِ استیتمنت در tenant-statement.builder.ts است (تست‌شده، بدون دیتابیس)؛ این‌جا
  // فقط ردیف‌ها خوانده می‌شود.
  //
  //  - فاکتورِ کرایهٔ لغوشده (CANCELED) بدهی نیست: فسخ/لغوِ قرارداد آن را لغو می‌کند ولی مبلغش را
  //    صفر نمی‌کند. پرداختیِ روی آن (پیش‌پرداخت) سر جایش می‌ماند و موجودی را بستانکار می‌کند.
  //  - هر ارز استیتمنتِ جدا دارد (کرایه به ارزِ قرارداد، برق به ارزِ هر بل) و هیچ‌وقت جمع نمی‌خورند.
  //  - مرزِ بازه: فاکتور/بل «تاریخِ تقویمی» است (UTC)، پرداخت «لحظه» است (روزِ کابل).
  //
  // کارایی: همهٔ کوئری‌ها مستقل و در Promise.all موازی؛ موجودیِ اولِ دوره با groupBy (فقط SUM)؛
  // بدهیِ بازِ هر قرارداد هم groupBy (یک کوئری برای همهٔ قراردادها، بدون N+1).
  // ==========================================================================
  async getStatement(
    currentUser: { id: string },
    tenantId: string,
    query: TenantStatementQueryDto,
  ) {
    const actor = await this.getActor(currentUser);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        fullName: true,
        fatherName: true,
        grandfatherName: true,
        idNumber: true,
        contact: true,
        marketId: true,
        // سربرگِ PDF (فرانت چاپ می‌کند) — از همین کوئری، بدون رفت‌وبرگشتِ اضافه.
        market: {
          select: { id: true, name: true, nameEn: true, logo: true, address: true, phone: true, email: true },
        },
      },
    });
    if (!tenant) throw new NotFoundException('مستأجر یافت نشد');
    this.ensureAccess(actor, tenant.marketId);

    const resolved = resolveStatementRange(query.from, query.to);
    if ('error' in resolved) {
      throw new BadRequestException(
        resolved.error === 'INVALID_DATE'
          ? 'تاریخ شروع یا پایان نامعتبر است'
          : 'تاریخ پایان باید بعد یا برابر تاریخ شروع باشد',
      );
    }
    const { range } = resolved;

    const zero = new Prisma.Decimal(0);
    const sumOf = (v: Prisma.Decimal | null | undefined) => v ?? zero;
    const currencyFilter = query.currencyId ? { currencyId: query.currencyId } : {};
    const now = new Date();

    const rentLive = { tenantId, status: { not: RentChargeStatus.CANCELED }, ...currencyFilter };
    const electricityLive = { tenantId, status: { not: ElectricityBillStatus.CANCELED }, ...currencyFilter };

    const [
      contracts,
      rentChargedBefore,
      rentPaidBefore,
      electricityBilledBefore,
      electricityPaidBefore,
      rentDueByContract,
      rentUpcomingByContract,
      electricityOpenByContract,
      rentCharges,
      rentPayments,
      electricityBills,
      electricityPayments,
    ] = await Promise.all([
      this.prisma.contract.findMany({
        where: { tenantId, ...currencyFilter },
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          rent: true,
          currencyId: true,
          securityDepositRemaining: true,
          shop: { select: { id: true, shopNumber: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.rentCharges.groupBy({
        by: ['currencyId'],
        where: { ...rentLive, periodStart: { lt: range.fromCalendar } },
        _sum: { netAmount: true },
      }),
      this.prisma.rentPayment.groupBy({
        by: ['currencyId'],
        where: { tenantId, ...currencyFilter, paymentDate: { lt: range.fromInstant } },
        _sum: { amount: true },
      }),
      this.prisma.electricityBill.groupBy({
        by: ['currencyId'],
        where: { ...electricityLive, periodEnd: { lt: range.fromCalendar } },
        _sum: { totalAmount: true },
      }),
      this.prisma.electricityPayment.groupBy({
        by: ['currencyId'],
        where: { tenantId, ...currencyFilter, paymentDate: { lt: range.fromInstant } },
        _sum: { amount: true },
      }),
      // بدهیِ «سررسیدشده» (periodStart رسیده) — همان تعریفِ RentService.recomputeRentDebt.
      this.prisma.rentCharges.groupBy({
        by: ['contractId'],
        where: { tenantId, ...currencyFilter, status: { in: RENT_OPEN_STATUSES }, periodStart: { lte: now } },
        _sum: { remainingAmount: true },
      }),
      // فاکتورهای آیندهٔ از قبل تولیدشدهٔ هنوز-سررسیدنشده: بدهی نیستند، فقط «پیش‌رو».
      this.prisma.rentCharges.groupBy({
        by: ['contractId'],
        where: { tenantId, ...currencyFilter, status: { in: RENT_OPEN_STATUSES }, periodStart: { gt: now } },
        _sum: { remainingAmount: true },
      }),
      this.prisma.electricityBill.groupBy({
        by: ['contractId', 'currencyId'],
        where: {
          tenantId,
          ...currencyFilter,
          contractId: { not: null },
          status: { in: ELECTRICITY_OPEN_STATUSES },
        },
        _sum: { remainingAmount: true },
      }),
      this.prisma.rentCharges.findMany({
        where: { ...rentLive, periodStart: { gte: range.fromCalendar, lt: range.toCalendarExclusive } },
        select: {
          id: true,
          contractId: true,
          periodStart: true,
          periodEnd: true,
          grossAmount: true,
          netAmount: true,
          currencyId: true,
          shop: { select: { shopNumber: true } },
        },
      }),
      this.prisma.rentPayment.findMany({
        where: {
          tenantId,
          ...currencyFilter,
          paymentDate: { gte: range.fromInstant, lt: range.toInstantExclusive },
        },
        select: {
          id: true,
          contractId: true,
          paymentDate: true,
          amount: true,
          currencyId: true,
          receiptNumber: true,
          source: true,
          isOpeningEntry: true,
          shop: { select: { shopNumber: true } },
        },
      }),
      this.prisma.electricityBill.findMany({
        where: { ...electricityLive, periodEnd: { gte: range.fromCalendar, lt: range.toCalendarExclusive } },
        select: {
          id: true,
          contractId: true,
          periodStart: true,
          periodEnd: true,
          periodNumber: true,
          totalAmount: true,
          currencyId: true,
          shop: { select: { shopNumber: true } },
        },
      }),
      this.prisma.electricityPayment.findMany({
        where: {
          tenantId,
          ...currencyFilter,
          paymentDate: { gte: range.fromInstant, lt: range.toInstantExclusive },
        },
        select: {
          id: true,
          paymentDate: true,
          amount: true,
          currencyId: true,
          receiptNumber: true,
          source: true,
          isOpeningEntry: true,
          shop: { select: { shopNumber: true } },
        },
      }),
    ]);

    const openingBalances = combineOpeningBalances({
      rentCharged: rentChargedBefore.map((g) => ({ currencyId: g.currencyId, amount: sumOf(g._sum.netAmount) })),
      rentPaid: rentPaidBefore.map((g) => ({ currencyId: g.currencyId, amount: sumOf(g._sum.amount) })),
      electricityBilled: electricityBilledBefore.map((g) => ({
        currencyId: g.currencyId,
        amount: sumOf(g._sum.totalAmount),
      })),
      electricityPaid: electricityPaidBefore.map((g) => ({ currencyId: g.currencyId, amount: sumOf(g._sum.amount) })),
    });

    const events = [
      ...rentCharges.map(rentChargeEvent),
      ...rentPayments.map(rentPaymentEvent),
      ...electricityBills.map(electricityBillEvent),
      ...electricityPayments.map(electricityPaymentEvent),
    ];

    const currencyIds = new Set<string>([
      ...openingBalances.keys(),
      ...events.map((e) => e.currencyId),
      ...contracts.flatMap((c) => (c.currencyId ? [c.currencyId] : [])),
      ...electricityOpenByContract.map((g) => g.currencyId),
    ]);
    const currencies = currencyIds.size
      ? await this.prisma.currency.findMany({
          where: { id: { in: [...currencyIds] } },
          select: { id: true, code: true },
        })
      : [];
    const currencyCodes = new Map(currencies.map((c) => [c.id, c.code]));

    const statements = buildCurrencyStatements({ events, openingBalances, currencyCodes });

    const rentDueMap = new Map(rentDueByContract.map((g) => [g.contractId, sumOf(g._sum.remainingAmount)]));
    const rentUpcomingMap = new Map(rentUpcomingByContract.map((g) => [g.contractId, sumOf(g._sum.remainingAmount)]));
    const electricityOpenMap = new Map<
      string,
      { currencyId: string; currencyCode: string | null; amount: Prisma.Decimal }[]
    >();
    for (const g of electricityOpenByContract) {
      const list = electricityOpenMap.get(g.contractId as string) ?? [];
      list.push({
        currencyId: g.currencyId,
        currencyCode: currencyCodes.get(g.currencyId) ?? null,
        amount: sumOf(g._sum.remainingAmount),
      });
      electricityOpenMap.set(g.contractId as string, list);
    }

    const contractsSummary = contracts.map((c) => {
      const electricityOpenDebts = electricityOpenMap.get(c.id) ?? [];
      return {
        contractId: c.id,
        shopNumber: c.shop?.shopNumber ?? null,
        status: c.status,
        startDate: c.startDate,
        endDate: c.endDate,
        rent: c.rent,
        currencyId: c.currencyId,
        currencyCode: c.currencyId ? (currencyCodes.get(c.currencyId) ?? null) : null,
        // بدهیِ سررسیدشدهٔ کرایه تا امروز (به ارزِ قرارداد) و کرایهٔ پیش‌رویِ هنوز-سررسیدنشده.
        rentOpenDebt: rentDueMap.get(c.id) ?? zero,
        rentUpcoming: rentUpcomingMap.get(c.id) ?? zero,
        // برق به ارزِ هر بل است و ممکن است با ارزِ قرارداد فرق کند؛ electricityOpenDebt فقط وقتی
        // عددی است که همهٔ بل‌های بازِ این قرارداد یک ارز باشند، وگرنه null (از electricityOpenDebts بخوانید).
        electricityOpenDebt:
          electricityOpenDebts.length === 0
            ? zero
            : electricityOpenDebts.length === 1
              ? electricityOpenDebts[0].amount
              : null,
        electricityOpenDebts,
        securityDepositRemaining: sumOf(c.securityDepositRemaining),
      };
    });

    return {
      tenantId: tenant.id,
      tenantName: tenant.fullName,
      marketId: tenant.marketId,
      generatedAt: now,
      // سربرگِ صورت‌حساب: لوگو همان مسیرِ ذخیره‌شده است (مثلاً /uploads/...)، فرانت آدرسِ کامل می‌سازد.
      market: tenant.market,
      tenant: {
        id: tenant.id,
        fullName: tenant.fullName,
        fatherName: tenant.fatherName,
        grandfatherName: tenant.grandfatherName,
        idNumber: tenant.idNumber,
        contact: tenant.contact,
      },
      from: query.from,
      to: query.to,
      currencyId: query.currencyId ?? null,
      // استیتمنتِ اصلی: یکی به‌ازای هر ارز. مثبت = مستأجر بدهکار، منفی = مستأجر بستانکار.
      currencies: statements,
      // سازگار با نسخهٔ قبل: برای مستأجرِ تک‌ارزی همان بلوک؛ برای چندارزی null (جمعِ ارزها بی‌معناست).
      ...legacyTopLevel(statements),
      contracts: contractsSummary,
    };
  }
}
