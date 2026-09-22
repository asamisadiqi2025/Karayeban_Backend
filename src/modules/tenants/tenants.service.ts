import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ensureMarketSetupComplete } from '../../common/utils/ensure-market-setup-complete';
import { paginate, resolveSort, buildSearchWhere } from '../../common/utils/pagination';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantQueryDto } from './dto/tenant-query.dto';
import { TenantStatementQueryDto } from './dto/tenant-statement-query.dto';
import { RENT_OPEN_STATUSES } from '../rent/rent.service';
import { ELECTRICITY_OPEN_STATUSES } from '../electricity/electricity.service';

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

  constructor(private readonly prisma: PrismaService) {}

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
    if (dto.photo !== undefined) data.photo = dto.photo?.trim() || null;
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
    return { message: `مستأجر «${tenant.fullName}» حذف شد` };
  }

  // ==========================================================================
  // استیتمنتِ کاملِ مستأجر — کرایه + برقِ همهٔ قراردادهایش (نه فقط یکی) با هم، به‌ترتیبِ
  // تاریخ، با موجودیِ تجمیعی. دقیقاً مثل AccountsService.getStatement (همان اصلِ «موجودی
  // را خودمان از رویدادهای خام، به‌ترتیبِ تاریخ، بازمحاسبه می‌کنیم، نه از یک فیلدِ
  // ذخیره‌شده» — چون تاریخِ فاکتور/پرداخت می‌تواند گذشته‌نگر باشد).
  //
  // کارایی: ۱۲ کوئری، همه مستقل و در Promise.all موازی (نه توالی)؛ موجودیِ اولِ دوره با
  // aggregate (فقط SUM، بدون خواندنِ ردیف‌ها) حساب می‌شود؛ بدهیِ بازِ هر قرارداد با
  // groupBy (یک کوئری برای همهٔ قراردادها، نه یک کوئری به‌ازای هرکدام — از N+1 جلوگیری
  // می‌کند). حجم دادهٔ هر ردیف هم فقط با select محدود شده، نه include کامل.
  async getStatement(
    currentUser: { id: string },
    tenantId: string,
    query: TenantStatementQueryDto,
  ) {
    const actor = await this.getActor(currentUser);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, fullName: true, marketId: true },
    });
    if (!tenant) throw new NotFoundException('مستأجر یافت نشد');
    this.ensureAccess(actor, tenant.marketId);

    const from = new Date(query.from);
    const to = new Date(query.to);
    if (to < from) {
      throw new BadRequestException(
        'تاریخ پایان باید بعد یا برابر تاریخ شروع باشد',
      );
    }
    const toExclusive = new Date(to);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

    const zero = new Prisma.Decimal(0);
    const sumOf = (v: Prisma.Decimal | null | undefined) => v ?? zero;

    const [
      contracts,
      rentOpeningAgg,
      rentPaidOpeningAgg,
      electricityOpeningAgg,
      electricityPaidOpeningAgg,
      rentOpenByContract,
      electricityOpenByContract,
      rentCharges,
      rentPayments,
      electricityBills,
      electricityPayments,
    ] = await Promise.all([
      this.prisma.contract.findMany({
        where: { tenantId },
        select: {
          id: true,
          status: true,
          securityDepositRemaining: true,
          shop: { select: { id: true, shopNumber: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.rentCharges.aggregate({
        where: { tenantId, periodStart: { lt: from } },
        _sum: { netAmount: true },
      }),
      this.prisma.rentPayment.aggregate({
        where: { tenantId, paymentDate: { lt: from } },
        _sum: { amount: true },
      }),
      this.prisma.electricityBill.aggregate({
        where: { tenantId, periodStart: { lt: from } },
        _sum: { totalAmount: true },
      }),
      this.prisma.electricityPayment.aggregate({
        where: { tenantId, paymentDate: { lt: from } },
        _sum: { amount: true },
      }),
      this.prisma.rentCharges.groupBy({
        by: ['contractId'],
        where: { tenantId, status: { in: RENT_OPEN_STATUSES } },
        _sum: { remainingAmount: true },
      }),
      this.prisma.electricityBill.groupBy({
        by: ['contractId'],
        where: {
          tenantId,
          contractId: { not: null },
          status: { in: ELECTRICITY_OPEN_STATUSES },
        },
        _sum: { remainingAmount: true },
      }),
      this.prisma.rentCharges.findMany({
        where: { tenantId, periodStart: { gte: from, lt: toExclusive } },
        select: {
          contractId: true,
          periodStart: true,
          netAmount: true,
          shop: { select: { shopNumber: true } },
        },
      }),
      this.prisma.rentPayment.findMany({
        where: { tenantId, paymentDate: { gte: from, lt: toExclusive } },
        select: {
          contractId: true,
          paymentDate: true,
          amount: true,
          receiptNumber: true,
          shop: { select: { shopNumber: true } },
        },
      }),
      this.prisma.electricityBill.findMany({
        where: { tenantId, periodStart: { gte: from, lt: toExclusive } },
        select: {
          contractId: true,
          periodStart: true,
          periodNumber: true,
          totalAmount: true,
          shop: { select: { shopNumber: true } },
        },
      }),
      this.prisma.electricityPayment.findMany({
        where: { tenantId, paymentDate: { gte: from, lt: toExclusive } },
        select: {
          paymentDate: true,
          amount: true,
          receiptNumber: true,
          shop: { select: { shopNumber: true } },
        },
      }),
    ]);

    const openingBalance = sumOf(rentOpeningAgg._sum.netAmount)
      .sub(sumOf(rentPaidOpeningAgg._sum.amount))
      .add(sumOf(electricityOpeningAgg._sum.totalAmount))
      .sub(sumOf(electricityPaidOpeningAgg._sum.amount));

    const rentOpenMap = new Map(
      rentOpenByContract.map((g) => [g.contractId, sumOf(g._sum.remainingAmount)]),
    );
    const electricityOpenMap = new Map(
      electricityOpenByContract.map((g) => [
        g.contractId as string,
        sumOf(g._sum.remainingAmount),
      ]),
    );

    const contractsSummary = contracts.map((c) => ({
      contractId: c.id,
      shopNumber: c.shop?.shopNumber ?? null,
      status: c.status,
      rentOpenDebt: rentOpenMap.get(c.id) ?? zero,
      electricityOpenDebt: electricityOpenMap.get(c.id) ?? zero,
      securityDepositRemaining: sumOf(c.securityDepositRemaining),
    }));

    type Event = {
      date: Date;
      type: 'RENT_CHARGE' | 'RENT_PAYMENT' | 'ELECTRICITY_BILL' | 'ELECTRICITY_PAYMENT';
      description: string;
      shopNumber: string | null;
      contractId: string | null;
      amount: Prisma.Decimal;
      direction: 'DEBIT' | 'CREDIT';
    };

    const events: Event[] = [
      ...rentCharges.map((c): Event => ({
        date: c.periodStart,
        type: 'RENT_CHARGE',
        description: `فاکتور کرایه — دوکان ${c.shop.shopNumber}`,
        shopNumber: c.shop.shopNumber,
        contractId: c.contractId,
        amount: c.netAmount,
        direction: 'DEBIT',
      })),
      ...rentPayments.map((p): Event => ({
        date: p.paymentDate,
        type: 'RENT_PAYMENT',
        description: `پرداخت کرایه — دوکان ${p.shop.shopNumber}${p.receiptNumber ? ` (رسید ${p.receiptNumber})` : ''}`,
        shopNumber: p.shop.shopNumber,
        contractId: p.contractId,
        amount: p.amount,
        direction: 'CREDIT',
      })),
      ...electricityBills.map((b): Event => ({
        date: b.periodStart,
        type: 'ELECTRICITY_BILL',
        description: `بل برق${b.periodNumber ? ` دورهٔ ${b.periodNumber}` : ''} — دوکان ${b.shop.shopNumber}`,
        shopNumber: b.shop.shopNumber,
        contractId: b.contractId,
        amount: b.totalAmount,
        direction: 'DEBIT',
      })),
      ...electricityPayments.map((p): Event => ({
        date: p.paymentDate,
        type: 'ELECTRICITY_PAYMENT',
        description: `پرداخت برق — دوکان ${p.shop.shopNumber}${p.receiptNumber ? ` (رسید ${p.receiptNumber})` : ''}`,
        shopNumber: p.shop.shopNumber,
        contractId: null,
        amount: p.amount,
        direction: 'CREDIT',
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    let runningBalance = openingBalance;
    let totalCharged = zero;
    let totalPaid = zero;
    const transactions = events.map((e) => {
      if (e.direction === 'DEBIT') {
        runningBalance = runningBalance.add(e.amount);
        totalCharged = totalCharged.add(e.amount);
      } else {
        runningBalance = runningBalance.sub(e.amount);
        totalPaid = totalPaid.add(e.amount);
      }
      return { ...e, balance: runningBalance };
    });

    return {
      tenantId: tenant.id,
      tenantName: tenant.fullName,
      from: query.from,
      to: query.to,
      openingBalance,
      closingBalance: runningBalance,
      totalCharged,
      totalPaid,
      contracts: contractsSummary,
      transactions,
    };
  }
}
