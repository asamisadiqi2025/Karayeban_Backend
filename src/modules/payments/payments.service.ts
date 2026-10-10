import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  PermissionsService,
  readGrantedPermissions,
} from '../permissions/permissions.service';
import {
  PaymentListQueryDto,
  PaymentType,
  PaymentTypeParam,
} from './dto/payment-list-query.dto';
import {
  buildElectricityPaymentWhere,
  buildRentPaymentWhere,
} from './payments-filters';
import {
  electricityToUnified,
  mergeCurrencySummary,
  mergePaymentPage,
  rentToUnified,
  resolvePaymentSortField,
} from './payments-merge';

type Actor = {
  id: string;
  role: string;
  marketId: string | null;
  grantedPermissions: unknown;
};

// هر نوعِ پرداخت با «همان کلیدِ دسترسیِ صفحهٔ خودش» محافظت می‌شود (نه یک کلیدِ تازه): کسی که فقط
// rent.view دارد فقط پرداخت‌های کرایه را می‌بیند، کسی که فقط electricity.view دارد فقط برق.
const VIEW_PERMISSION: Record<PaymentType, string> = {
  RENT: 'rent.view',
  ELECTRICITY: 'electricity.view',
};
const TYPE_LABEL: Record<PaymentType, string> = {
  RENT: 'کرایه',
  ELECTRICITY: 'برق',
};

// وقتی هر دو نوع با هم فهرست می‌شوند، صفحهٔ N از ادغامِ «(N×limit) ردیفِ اولِ هر جدول» ساخته
// می‌شود؛ این سقف جلوی صفحه‌های بسیار عمیق (که حافظه/زمانِ زیادی می‌خواهند) را می‌گیرد. برای
// رفتن عمیق‌تر باید نوع یا بازهٔ تاریخ را محدود کرد.
const MAX_MERGE_WINDOW = 5000;

const LIST_INCLUDE = {
  tenant: { select: { id: true, fullName: true } },
  shop: { select: { id: true, shopNumber: true } },
  currency: { select: { id: true, code: true } },
  account: { select: { id: true, name: true } },
  collectedBy: { select: { id: true, fullName: true } },
  _count: { select: { allocations: true } },
} as const;

const LEDGER_SELECT = {
  id: true,
  direction: true,
  amount: true,
  balanceAfter: true,
  entryDate: true,
  exchangeRate: true,
  baseCurrencyAmount: true,
} as const;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  // ───────────────────────── دسترسی و دامنهٔ بازار ─────────────────────────

  private async resolveAccess(currentUser: { id: string }) {
    const actor: Actor | null = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: {
        id: true,
        role: true,
        marketId: true,
        grantedPermissions: true,
      },
    });
    if (!actor) throw new ForbiddenException('کاربر معتبر نیست');
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }

    const granted = new Set(
      this.permissions.effectiveKeys(
        actor.role,
        readGrantedPermissions(actor.grantedPermissions),
      ),
    );
    const allowedTypes = (['RENT', 'ELECTRICITY'] as const).filter((t) =>
      granted.has(VIEW_PERMISSION[t]),
    );
    // مثلِ بقیهٔ لیست‌ها: SUPER_ADMIN همهٔ بازارها را می‌بیند، بقیه فقط بازارِ خودشان را.
    const scope =
      actor.role === 'SUPER_ADMIN' ? {} : { marketId: actor.marketId! };
    return { actor, allowedTypes, scope };
  }

  // ───────────────────────── فهرستِ یکپارچه ─────────────────────────

  async findAll(currentUser: { id: string }, query: PaymentListQueryDto) {
    const { allowedTypes, scope } = await this.resolveAccess(currentUser);

    let types: PaymentType[] = allowedTypes;
    if (query.type !== undefined) {
      if (!allowedTypes.includes(query.type)) {
        throw new ForbiddenException(
          `دسترسیِ دیدنِ پرداخت‌های ${TYPE_LABEL[query.type]} را ندارید`,
        );
      }
      types = [query.type];
    }
    if (types.length === 0) {
      throw new ForbiddenException('دسترسیِ دیدنِ پرداخت‌ها را ندارید');
    }

    const page = Math.max(1, Math.floor(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Math.floor(query.limit ?? 20)));
    const skip = (page - 1) * limit;
    const sortField = resolvePaymentSortField(query.sortBy);
    const direction = query.sortOrder ?? 'desc';

    const single = types.length === 1;
    if (!single && skip + limit > MAX_MERGE_WINDOW) {
      throw new BadRequestException(
        'صفحهٔ درخواستی خیلی عمیق است؛ نوع پرداخت یا بازهٔ تاریخ را محدود کنید',
      );
    }
    // یک نوع: صفحه‌بندیِ عادیِ دیتابیس. دو نوع: از هر جدول (skip+limit) ردیفِ اول → ادغام → برش.
    const take = single ? limit : skip + limit;
    const offset = single ? skip : 0;

    const rentWhere: Prisma.RentPaymentWhereInput = {
      ...scope,
      ...buildRentPaymentWhere(query),
    };
    const electricityWhere: Prisma.ElectricityPaymentWhereInput = {
      ...scope,
      ...buildElectricityPaymentWhere(query),
    };
    const rentOrder = [
      { [sortField]: direction },
      { id: direction },
    ] as Prisma.RentPaymentOrderByWithRelationInput[];
    const electricityOrder = [
      { [sortField]: direction },
      { id: direction },
    ] as Prisma.ElectricityPaymentOrderByWithRelationInput[];

    const [rent, electricity] = await Promise.all([
      types.includes('RENT')
        ? Promise.all([
            this.prisma.rentPayment.findMany({
              where: rentWhere,
              orderBy: rentOrder,
              skip: offset,
              take,
              include: LIST_INCLUDE,
            }),
            this.prisma.rentPayment.groupBy({
              by: ['currencyId'],
              where: rentWhere,
              _sum: { amount: true },
              _count: true,
            }),
          ])
        : null,
      types.includes('ELECTRICITY')
        ? Promise.all([
            this.prisma.electricityPayment.findMany({
              where: electricityWhere,
              orderBy: electricityOrder,
              skip: offset,
              take,
              include: LIST_INCLUDE,
            }),
            this.prisma.electricityPayment.groupBy({
              by: ['currencyId'],
              where: electricityWhere,
              _sum: { amount: true },
              _count: true,
            }),
          ])
        : null,
    ]);

    const rentItems = (rent?.[0] ?? []).map(rentToUnified);
    const electricityItems = (electricity?.[0] ?? []).map(electricityToUnified);
    const data = single
      ? [...rentItems, ...electricityItems]
      : mergePaymentPage(
          [rentItems, electricityItems],
          sortField,
          direction,
          skip,
          limit,
        );

    // total و جمعِ ارزها از همان groupBy (بدونِ count جداگانه): هر گروه _count و _sum دارد.
    const groups = [rent?.[1] ?? [], electricity?.[1] ?? []].map((list) =>
      list.map((g) => ({
        currencyId: g.currencyId,
        amount: g._sum.amount,
        count: typeof g._count === 'number' ? g._count : 0,
      })),
    );
    const total = groups.flat().reduce((n, g) => n + g.count, 0);
    const currencyIds = [...new Set(groups.flat().map((g) => g.currencyId))];
    const codes = new Map(
      currencyIds.length
        ? (
            await this.prisma.currency.findMany({
              where: { id: { in: currencyIds } },
              select: { id: true, code: true },
            })
          ).map((c) => [c.id, c.code] as [string, string])
        : [],
    );

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      // جمعِ «کلِ نتیجهٔ فیلتر» (نه فقط همین صفحه) به‌تفکیکِ ارز؛ ارزها هرگز با هم جمع نمی‌شوند.
      summary: { byCurrency: mergeCurrencySummary(groups, codes) },
    };
  }

  // ───────────────────────── جزئیاتِ یک پرداخت ─────────────────────────

  async findOne(
    currentUser: { id: string },
    typeParam: PaymentTypeParam,
    id: string,
  ) {
    const { actor, allowedTypes } = await this.resolveAccess(currentUser);
    const type: PaymentType =
      typeParam === PaymentTypeParam.RENT ? 'RENT' : 'ELECTRICITY';
    if (!allowedTypes.includes(type)) {
      throw new ForbiddenException(
        `دسترسیِ دیدنِ پرداخت‌های ${TYPE_LABEL[type]} را ندارید`,
      );
    }

    const payment =
      type === 'RENT'
        ? await this.loadRentDetail(id)
        : await this.loadElectricityDetail(id);
    if (!payment) throw new NotFoundException('پرداخت یافت نشد');
    if (actor.role !== 'SUPER_ADMIN' && actor.marketId !== payment.marketId) {
      throw new ForbiddenException('دسترسی به این پرداخت مجاز نیست');
    }
    return payment;
  }

  private async loadRentDetail(id: string) {
    const p = await this.prisma.rentPayment.findUnique({
      where: { id },
      include: {
        tenant: {
          select: { id: true, fullName: true, fatherName: true, contact: true },
        },
        shop: {
          select: {
            id: true,
            shopNumber: true,
            floor: { select: { id: true, floorNumber: true, name: true } },
          },
        },
        contract: {
          select: {
            id: true,
            status: true,
            startDate: true,
            endDate: true,
            rent: true,
            currencyId: true,
          },
        },
        currency: { select: { id: true, code: true, name: true } },
        account: {
          select: { id: true, name: true, type: true, bankName: true },
        },
        collectedBy: { select: { id: true, fullName: true } },
        allocations: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            amount: true,
            rentCharge: {
              select: {
                id: true,
                periodStart: true,
                periodEnd: true,
                netAmount: true,
                paidAmount: true,
                remainingAmount: true,
                status: true,
              },
            },
          },
        },
        ledgerEntry: { select: LEDGER_SELECT },
      },
    });
    if (!p) return null;

    const { allocations, ...rest } = p;
    return {
      type: 'RENT' as const,
      ...rest,
      // فاکتورهایی که این پرداخت روی آن‌ها نشسته (FIFO)، با هم‌شکل‌سازی با پرداخت‌های برق.
      allocations: allocations.map((a) => ({
        id: a.id,
        amount: a.amount,
        target: {
          kind: 'RENT_CHARGE' as const,
          id: a.rentCharge.id,
          periodStart: a.rentCharge.periodStart,
          periodEnd: a.rentCharge.periodEnd,
          totalAmount: a.rentCharge.netAmount,
          paidAmount: a.rentCharge.paidAmount,
          remainingAmount: a.rentCharge.remainingAmount,
          status: a.rentCharge.status,
        },
      })),
    };
  }

  private async loadElectricityDetail(id: string) {
    const p = await this.prisma.electricityPayment.findUnique({
      where: { id },
      include: {
        tenant: {
          select: { id: true, fullName: true, fatherName: true, contact: true },
        },
        shop: {
          select: {
            id: true,
            shopNumber: true,
            floor: { select: { id: true, floorNumber: true, name: true } },
          },
        },
        currency: { select: { id: true, code: true, name: true } },
        account: {
          select: { id: true, name: true, type: true, bankName: true },
        },
        collectedBy: { select: { id: true, fullName: true } },
        allocations: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            amount: true,
            bill: {
              select: {
                id: true,
                contractId: true,
                year: true,
                periodNumber: true,
                periodStart: true,
                periodEnd: true,
                previousReading: true,
                currentReading: true,
                consumedUnits: true,
                ratePerUnit: true,
                totalAmount: true,
                paidAmount: true,
                remainingAmount: true,
                status: true,
              },
            },
          },
        },
        ledgerEntry: { select: LEDGER_SELECT },
      },
    });
    if (!p) return null;

    const { allocations, ...rest } = p;
    return {
      type: 'ELECTRICITY' as const,
      ...rest,
      // قراردادهایی که بل‌های این پرداخت به آن‌ها تعلق دارند (پرداخت خودش قرارداد ندارد).
      contractIds: [
        ...new Set(
          allocations.flatMap((a) =>
            a.bill.contractId ? [a.bill.contractId] : [],
          ),
        ),
      ],
      allocations: allocations.map((a) => ({
        id: a.id,
        amount: a.amount,
        target: {
          kind: 'ELECTRICITY_BILL' as const,
          id: a.bill.id,
          contractId: a.bill.contractId,
          year: a.bill.year,
          periodNumber: a.bill.periodNumber,
          periodStart: a.bill.periodStart,
          periodEnd: a.bill.periodEnd,
          previousReading: a.bill.previousReading,
          currentReading: a.bill.currentReading,
          consumedUnits: a.bill.consumedUnits,
          ratePerUnit: a.bill.ratePerUnit,
          totalAmount: a.bill.totalAmount,
          paidAmount: a.bill.paidAmount,
          remainingAmount: a.bill.remainingAmount,
          status: a.bill.status,
        },
      })),
    };
  }
}
