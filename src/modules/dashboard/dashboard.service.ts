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
import { DashboardOverviewQueryDto } from './dto/dashboard-overview-query.dto';
import { DashboardTrendQueryDto } from './dto/dashboard-trend-query.dto';
import {
  DailySeries,
  DateRange,
  addToSeries,
  jalaliMonthRange,
  jalaliYearRange,
  kabulDayStart,
  kabulToday,
  lastDayKeys,
  monthName,
  percentChange,
  previousJalaliMonth,
  sparkline,
  totalForMonth,
  totalsByJalaliMonth,
} from './dashboard.utils';
import {
  jalaliMonthStart,
  toJalaliYearMonth,
} from '../../common/utils/jalali-date';

type Actor = {
  id: string;
  role: string;
  marketId: string | null;
  grantedPermissions: unknown;
};
type Can = (permission: string) => boolean;

const ZERO = new Prisma.Decimal(0);
const SPARKLINE_DAYS = 30;
const RECENT_LIMIT = 5;
const OPEN_ELECTRICITY_BILL_STATUSES = [
  'PENDING',
  'PARTIAL',
  'OVERDUE',
] as const;

// هر ویجتِ داشبورد با «همان کلیدِ دسترسیِ صفحهٔ خودش» محافظت می‌شود (نه یک کلیدِ تازه) — پس ادمین
// همه‌چیز را می‌بیند و حسابدار/کارمندِ دارای فهرستِ دسترسیِ سفارشی فقط ویجت‌هایی را که خودش
// اجازهٔ دیدنشان را دارد؛ ویجتِ ممنوع‌شده null برمی‌گردد (۴۰۳ نمی‌شود تا کلِ صفحه خراب نشود).
const PERM = {
  money: 'reports.view',
  electricity: 'electricity.view',
  expenses: 'expenses.view',
  tenants: 'tenants.view',
  shops: 'shops.view',
  contracts: 'contracts.view',
  inventory: 'inventory.view',
} as const;

// «درآمد» = فقط پولی که واقعاً وارد حساب شده و از فعالیتِ اصلیِ بازار می‌آید (کرایه، برق، درآمد
// متفرقه) — منبع حقیقت LedgerEntry است، همان دفتری که گزارش‌های مالی روی آن‌اند. انتقالِ بین
// حساب‌ها، واریزِ سهام‌دار، قرض، موجودی اولیه و ... عمداً درآمد حساب نمی‌شوند.
type LedgerDailyRow = {
  day: string;
  kind: 'RENT' | 'ELECTRICITY' | 'MISC';
  total: string;
  without_base: number;
};
type ExpenseDailyRow = { day: string; total: string; without_base: number };

// معادلِ ارز پایهٔ یک ردیف: اگر اسنپ‌شاتِ ذخیره‌شده هست همان؛ وگرنه، فقط وقتی ردیف از قبل به
// ارزِ پایهٔ بازار است، خودِ مبلغ (نرخ دقیقاً ۱ است، حدس نیست). ردیف‌های قدیمیِ ارزِ دیگر که
// اسنپ‌شات ندارند NULL می‌مانند و در entriesWithoutBaseValue شمرده می‌شوند، نه با نرخِ حدسی جمع.
const baseAmount = (
  baseCol: string,
  currencyCol: string,
  baseCurrencyId: string | null,
) =>
  Prisma.sql`COALESCE(${Prisma.raw(baseCol)}, CASE WHEN ${Prisma.raw(currencyCol)} = ${baseCurrencyId}::uuid THEN amount END)`;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  // ───────────────────────── دسترسی و بازار ─────────────────────────

  private async resolveContext(
    currentUser: { id: string },
    providedMarketId: string | undefined,
  ) {
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

    let marketId: string;
    if (actor.role === 'SUPER_ADMIN') {
      if (!providedMarketId)
        throw new BadRequestException('برای سوپر ادمین، marketId الزامی است');
      marketId = providedMarketId;
    } else {
      if (!actor.marketId)
        throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
      marketId = actor.marketId;
    }

    const granted = new Set(
      this.permissions.effectiveKeys(
        actor.role,
        readGrantedPermissions(actor.grantedPermissions),
      ),
    );
    const can: Can = (permission) => granted.has(permission);
    return { marketId, can };
  }

  private async loadMarket(marketId: string) {
    const market = await this.prisma.market.findUnique({
      where: { id: marketId },
      select: {
        id: true,
        name: true,
        baseCurrency: { select: { id: true, code: true, name: true } },
      },
    });
    if (!market) throw new NotFoundException('بازار یافت نشد');
    return market;
  }

  // ───────────────────────── کوئری‌های تجمیعی (همه در سطح دیتابیس) ─────────────────────────

  // درآمدِ روزانه به ارز پایه (با نرخِ همان روزِ هر رویداد، نه نرخِ امروز) در یک کوئری برای هر سه
  // نوع. روز به وقتِ کابل بریده می‌شود تا یک پرداختِ ساعت ۲۳ کابل به روزِ بعد نپرد.
  private async loadLedgerDaily(
    marketId: string,
    baseCurrencyId: string | null,
    range: DateRange,
  ) {
    const rows = await this.prisma.$queryRaw<LedgerDailyRow[]>(Prisma.sql`
      SELECT to_char(entry_date AT TIME ZONE 'Asia/Kabul', 'YYYY-MM-DD') AS day,
             CASE WHEN rent_payment_id IS NOT NULL THEN 'RENT'
                  WHEN electricity_payment_id IS NOT NULL THEN 'ELECTRICITY'
                  ELSE 'MISC' END AS kind,
             COALESCE(SUM(${baseAmount('base_currency_amount', 'currency_id', baseCurrencyId)}), 0)::text AS total,
             (COUNT(*) FILTER (WHERE ${baseAmount('base_currency_amount', 'currency_id', baseCurrencyId)} IS NULL))::int AS without_base
      FROM ledger_entries
      WHERE market_id = ${marketId}::uuid
        AND direction = 'IN'
        AND entry_date >= ${range.from} AND entry_date < ${range.to}
        AND (rent_payment_id IS NOT NULL
             OR electricity_payment_id IS NOT NULL
             OR miscellaneous_income_id IS NOT NULL)
      GROUP BY 1, 2`);

    const revenue: DailySeries = new Map();
    const electricity: DailySeries = new Map();
    let revenueWithoutBase = 0;
    let electricityWithoutBase = 0;
    for (const row of rows) {
      const value = new Prisma.Decimal(row.total);
      addToSeries(revenue, row.day, value);
      revenueWithoutBase += row.without_base;
      if (row.kind === 'ELECTRICITY') {
        addToSeries(electricity, row.day, value);
        electricityWithoutBase += row.without_base;
      }
    }
    return { revenue, electricity, revenueWithoutBase, electricityWithoutBase };
  }

  private async loadExpenseDaily(
    marketId: string,
    baseCurrencyId: string | null,
    range: DateRange,
  ) {
    const rows = await this.prisma.$queryRaw<ExpenseDailyRow[]>(Prisma.sql`
      SELECT to_char(expense_date AT TIME ZONE 'Asia/Kabul', 'YYYY-MM-DD') AS day,
             COALESCE(SUM(${baseAmount('base_currency_amount', 'currency_id', baseCurrencyId)}), 0)::text AS total,
             (COUNT(*) FILTER (WHERE ${baseAmount('base_currency_amount', 'currency_id', baseCurrencyId)} IS NULL))::int AS without_base
      FROM expenses
      WHERE market_id = ${marketId}::uuid
        AND expense_date >= ${range.from} AND expense_date < ${range.to}
      GROUP BY 1`);

    const series: DailySeries = new Map();
    let withoutBase = 0;
    for (const row of rows) {
      addToSeries(series, row.day, new Prisma.Decimal(row.total));
      withoutBase += row.without_base;
    }
    return { series, withoutBase };
  }

  // قراردادهای جدید در هر برجِ یک سال (لغوشده‌ها حساب نمی‌شوند). startDate ستونِ بدون‌منطقهٔ زمانی
  // است که تاریخِ تقویمی را نیمه‌شبِ UTC نگه می‌دارد، پس بازه هم با نیمه‌شبِ UTC ساخته می‌شود
  // (همان قاعدهٔ toJalaliYearMonth که برای پرداخت‌ها استفاده می‌شود).
  private async loadNewContractsByMonth(
    marketId: string,
    year: number,
  ): Promise<number[]> {
    const rows = await this.prisma.contract.findMany({
      where: {
        marketId,
        status: { not: 'cancelled' },
        startDate: {
          gte: jalaliMonthStart(year, 1),
          lt: jalaliMonthStart(year + 1, 1),
        },
      },
      select: { startDate: true },
    });
    const counts = Array.from({ length: 13 }, () => 0);
    for (const row of rows) {
      if (!row.startDate) continue;
      counts[toJalaliYearMonth(row.startDate).month] += 1;
    }
    return counts;
  }

  private async currencyCodeMap(ids: string[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map<string, string>();
    const currencies = await this.prisma.currency.findMany({
      where: { id: { in: unique } },
      select: { id: true, code: true },
    });
    return new Map(currencies.map((c) => [c.id, c.code]));
  }

  // ───────────────────────── ویجت‌ها ─────────────────────────

  private async getShopStatus(marketId: string) {
    const grouped = await this.prisma.shop.groupBy({
      by: ['status'],
      where: { marketId, isActive: true },
      _count: true,
    });
    const byStatus = {
      rented: 0,
      empty: 0,
      pending: 0,
      active: 0,
      inactive: 0,
    };
    let total = 0;
    for (const row of grouped) {
      byStatus[row.status] += row._count;
      total += row._count;
    }
    return {
      total,
      byStatus,
      occupancyRate: total === 0 ? null : byStatus.rented / total,
    };
  }

  private async getOutstandingElectricity(marketId: string) {
    const grouped = await this.prisma.electricityBill.groupBy({
      by: ['currencyId'],
      where: { marketId, status: { in: [...OPEN_ELECTRICITY_BILL_STATUSES] } },
      _sum: { remainingAmount: true },
      _count: true,
    });
    const codes = await this.currencyCodeMap(grouped.map((g) => g.currencyId));
    return grouped
      .map((g) => ({
        currencyId: g.currencyId,
        currencyCode: codes.get(g.currencyId) ?? null,
        remaining: g._sum.remainingAmount ?? ZERO,
        openBills: g._count,
      }))
      .sort((a, b) =>
        (a.currencyCode ?? '').localeCompare(b.currencyCode ?? ''),
      );
  }

  // خلاصهٔ مصارف به تفکیکِ کتگوریِ مادر (مصرفِ زیرشاخه‌ها به مادرشان جمع می‌شود)، همان
  // قاعدهٔ درختِ ۲‌سطحیِ getExpenseBreakdown. فقط خواندنی و groupBy در دیتابیس.
  private async getExpenseSummary(
    marketId: string,
    baseCurrencyId: string | null,
    range: DateRange,
  ) {
    const [categories, grouped] = await Promise.all([
      this.prisma.expenseCategory.findMany({
        where: { OR: [{ marketId: null }, { marketId }] },
        select: { id: true, name: true, parentId: true },
      }),
      this.prisma.$queryRaw<
        {
          category_id: string;
          total: string;
          entries: number;
          without_base: number;
        }[]
      >(Prisma.sql`
        SELECT category_id::text AS category_id,
               COALESCE(SUM(${baseAmount('base_currency_amount', 'currency_id', baseCurrencyId)}), 0)::text AS total,
               COUNT(*)::int AS entries,
               (COUNT(*) FILTER (WHERE ${baseAmount('base_currency_amount', 'currency_id', baseCurrencyId)} IS NULL))::int AS without_base
        FROM expenses
        WHERE market_id = ${marketId}::uuid
          AND expense_date >= ${range.from} AND expense_date < ${range.to}
        GROUP BY category_id`),
    ]);
    const withoutBase = grouped.reduce((n, g) => n + g.without_base, 0);

    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const parents = new Map<
      string,
      {
        total: Prisma.Decimal;
        count: number;
        children: Map<string, Prisma.Decimal>;
      }
    >();
    let grandTotal = ZERO;

    for (const row of grouped) {
      const category = categoryById.get(row.category_id);
      const amount = new Prisma.Decimal(row.total);
      const parentId = category?.parentId ?? row.category_id;
      const bucket = parents.get(parentId) ?? {
        total: ZERO,
        count: 0,
        children: new Map<string, Prisma.Decimal>(),
      };
      bucket.total = bucket.total.add(amount);
      bucket.count += row.entries;
      if (category?.parentId) {
        bucket.children.set(
          row.category_id,
          (bucket.children.get(row.category_id) ?? ZERO).add(amount),
        );
      }
      parents.set(parentId, bucket);
      grandTotal = grandTotal.add(amount);
    }

    const items = [...parents.entries()]
      .map(([id, bucket]) => ({
        categoryId: id,
        name: categoryById.get(id)?.name ?? null,
        totalInBase: bucket.total,
        count: bucket.count,
        percent: grandTotal.isZero()
          ? 0
          : Math.round(bucket.total.div(grandTotal).mul(1000).toNumber()) / 10,
        children: [...bucket.children.entries()]
          .map(([childId, amount]) => ({
            categoryId: childId,
            name: categoryById.get(childId)?.name ?? null,
            totalInBase: amount,
          }))
          .sort((a, b) => b.totalInBase.comparedTo(a.totalInBase)),
      }))
      .sort((a, b) => b.totalInBase.comparedTo(a.totalInBase));

    return {
      totalInBase: grandTotal,
      entriesWithoutBaseValue: withoutBase,
      byCategory: items,
    };
  }

  private async getRecentExpenses(marketId: string) {
    const rows = await this.prisma.expense.findMany({
      where: { marketId },
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
      take: RECENT_LIMIT,
      select: {
        id: true,
        amount: true,
        baseCurrencyAmount: true,
        expenseDate: true,
        description: true,
        currency: { select: { code: true } },
        category: {
          select: {
            id: true,
            name: true,
            parent: { select: { id: true, name: true } },
          },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      currencyCode: r.currency.code,
      amountInBase: r.baseCurrencyAmount,
      expenseDate: r.expenseDate,
      description: r.description,
      category: r.category.name,
      parentCategory: r.category.parent?.name ?? null,
    }));
  }

  // ارزشِ موجودیِ انبار: qty × averageCost در SQL جمع می‌شود (نه خواندنِ همهٔ کالاها در RAM)، به
  // تفکیکِ ارزِ هر کالا — چون averageCost به ارزِ خودِ کالاست و اینجا تبدیلِ نرخ لازم نیست.
  private async getWarehouseSummary(marketId: string) {
    const [stock, warehouseCount] = await Promise.all([
      this.prisma.$queryRaw<
        { currency_id: string; item_count: number; total_value: string }[]
      >(Prisma.sql`
        SELECT currency_id::text AS currency_id,
               COUNT(*)::int AS item_count,
               COALESCE(SUM(quantity * average_cost), 0)::text AS total_value
        FROM inventory_items
        WHERE market_id = ${marketId}::uuid AND is_deleted = false
        GROUP BY currency_id`),
      this.prisma.warehouse.count({ where: { marketId, isDeleted: false } }),
    ]);
    const codes = await this.currencyCodeMap(stock.map((s) => s.currency_id));
    return {
      warehouseCount,
      totalItems: stock.reduce((n, s) => n + s.item_count, 0),
      byCurrency: stock
        .map((s) => ({
          currencyId: s.currency_id,
          currencyCode: codes.get(s.currency_id) ?? null,
          itemCount: s.item_count,
          totalValue: new Prisma.Decimal(s.total_value),
        }))
        .sort((a, b) =>
          (a.currencyCode ?? '').localeCompare(b.currencyCode ?? ''),
        ),
    };
  }

  private async getRecentInventoryTransactions(marketId: string) {
    const rows = await this.prisma.inventoryTransaction.findMany({
      where: { marketId },
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      take: RECENT_LIMIT,
      select: {
        id: true,
        type: true,
        quantity: true,
        totalAmount: true,
        transactionDate: true,
        item: {
          select: {
            name: true,
            unit: { select: { name: true, symbol: true } },
          },
        },
        warehouse: { select: { name: true } },
        currency: { select: { code: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      quantity: r.quantity,
      unit: r.item.unit.symbol ?? r.item.unit.name,
      totalAmount: r.totalAmount,
      currencyCode: r.currency.code,
      transactionDate: r.transactionDate,
      itemName: r.item.name,
      warehouseName: r.warehouse.name,
    }));
  }

  // ───────────────────────── روند ماهانه ─────────────────────────

  private buildTrend(
    year: number,
    sources: {
      revenue: DailySeries | null;
      expenses: DailySeries | null;
      newContracts: number[] | null;
    },
  ) {
    const revenue = sources.revenue
      ? totalsByJalaliMonth(sources.revenue, year)
      : null;
    const expenses = sources.expenses
      ? totalsByJalaliMonth(sources.expenses, year)
      : null;
    const sum = (list: Prisma.Decimal[] | null) =>
      list ? list.reduce((acc, v) => acc.add(v), ZERO) : null;

    return {
      year,
      // ماه‌ها همیشه ۱۲ تا هستند (ماه‌های بدون رویداد ۰)؛ ستونی که کاربر مجوزش را ندارد null است.
      months: Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        return {
          month,
          name: monthName(month),
          revenue: revenue ? revenue[month].toNumber() : null,
          expenses: expenses ? expenses[month].toNumber() : null,
          newContracts: sources.newContracts
            ? sources.newContracts[month]
            : null,
        };
      }),
      totals: {
        revenue: sum(revenue),
        expenses: sum(expenses),
        newContracts: sources.newContracts
          ? sources.newContracts.reduce((n, c) => n + c, 0)
          : null,
      },
    };
  }

  async getMonthlyTrend(
    currentUser: { id: string },
    query: DashboardTrendQueryDto,
  ) {
    const { marketId, can } = await this.resolveContext(
      currentUser,
      query.marketId,
    );
    const market = await this.loadMarket(marketId);
    const year = query.year ?? kabulToday().year;
    const range = jalaliYearRange(year);

    const [ledger, expenses, newContracts] = await Promise.all([
      can(PERM.money)
        ? this.loadLedgerDaily(marketId, market.baseCurrency?.id ?? null, range)
        : null,
      can(PERM.expenses)
        ? this.loadExpenseDaily(
            marketId,
            market.baseCurrency?.id ?? null,
            range,
          )
        : null,
      can(PERM.contracts) ? this.loadNewContractsByMonth(marketId, year) : null,
    ]);

    return {
      marketId,
      baseCurrency: market.baseCurrency,
      ...this.buildTrend(year, {
        revenue: ledger?.revenue ?? null,
        expenses: expenses?.series ?? null,
        newContracts,
      }),
      // اگر > ۰ باشد، جمع‌ها ناقص‌اند: رویدادهایی هستند که معادلِ ارز پایه ندارند (قدیمی‌ها، قبل از ثبتِ نرخ).
      entriesWithoutBaseValue: {
        revenue: ledger?.revenueWithoutBase ?? null,
        expenses: expenses?.withoutBase ?? null,
      },
    };
  }

  // ───────────────────────── نمای کلی (یک درخواست برای کلِ صفحه) ─────────────────────────

  async getOverview(
    currentUser: { id: string },
    query: DashboardOverviewQueryDto,
  ) {
    const { marketId, can } = await this.resolveContext(
      currentUser,
      query.marketId,
    );
    const market = await this.loadMarket(marketId);
    const baseCurrencyId = market.baseCurrency?.id ?? null;

    const { today, year, month } = kabulToday();
    const previous = previousJalaliMonth(year, month);
    const period = query.period ?? 'month';
    const expenseRange =
      period === 'year' ? jalaliYearRange(year) : jalaliMonthRange(year, month);

    // یک بازهٔ واحد که هم «کلِ سالِ جاری» (نمودار)، هم «برجِ قبل» (درصدِ تغییر) و هم «۳۰ روزِ
    // آخر» (sparkline) را می‌پوشاند — پس برای همهٔ این‌ها فقط یک کوئریِ تجمیعی لازم است.
    const yearRange = jalaliYearRange(year);
    const sparkStart = kabulDayStart(today, SPARKLINE_DAYS - 1);
    const seriesRange: DateRange = {
      from: new Date(
        Math.min(
          yearRange.from.getTime(),
          jalaliMonthRange(previous.year, previous.month).from.getTime(),
          sparkStart.getTime(),
        ),
      ),
      to: yearRange.to,
    };

    const canMoney = can(PERM.money);
    const canElectricity = can(PERM.electricity);
    const canExpenses = can(PERM.expenses);
    const canShops = can(PERM.shops);

    const [
      ledger,
      expenseDaily,
      newContracts,
      activeTenants,
      shopStatus,
      electricityOutstanding,
      expenseSummary,
      recentExpenses,
      warehouse,
      recentInventory,
    ] = await Promise.all([
      canMoney || canElectricity
        ? this.loadLedgerDaily(marketId, baseCurrencyId, seriesRange)
        : null,
      canExpenses
        ? this.loadExpenseDaily(marketId, baseCurrencyId, seriesRange)
        : null,
      can(PERM.contracts) ? this.loadNewContractsByMonth(marketId, year) : null,
      can(PERM.tenants)
        ? this.prisma.tenant.count({
            where: {
              marketId,
              isActive: true,
              contracts: { some: { status: 'active' } },
            },
          })
        : null,
      canShops ? this.getShopStatus(marketId) : null,
      canElectricity ? this.getOutstandingElectricity(marketId) : null,
      canExpenses
        ? this.getExpenseSummary(marketId, baseCurrencyId, expenseRange)
        : null,
      canExpenses ? this.getRecentExpenses(marketId) : null,
      can(PERM.inventory) ? this.getWarehouseSummary(marketId) : null,
      can(PERM.inventory)
        ? this.getRecentInventoryTransactions(marketId)
        : null,
    ]);

    const sparkKeys = lastDayKeys(today, SPARKLINE_DAYS);
    const flowCard = (series: DailySeries, withoutBase: number) => {
      const thisMonth = totalForMonth(series, year, month);
      const lastMonth = totalForMonth(series, previous.year, previous.month);
      return {
        thisMonth,
        previousMonth: lastMonth,
        // مقایسهٔ برجِ جاری (تا امروز) با برجِ کاملِ قبل؛ null یعنی برجِ قبل صفر بوده و درصد تعریف‌نشده است.
        changePercent: percentChange(thisMonth, lastMonth),
        sparkline: sparkline(series, sparkKeys),
        entriesWithoutBaseValue: withoutBase,
      };
    };

    const revenueYearTotal =
      ledger && canMoney
        ? totalsByJalaliMonth(ledger.revenue, year).reduce(
            (a, v) => a.add(v),
            ZERO,
          )
        : null;

    return {
      marketId,
      generatedAt: new Date(),
      baseCurrency: market.baseCurrency,
      calendar: {
        jalaliYear: year,
        jalaliMonth: month,
        jalaliMonthName: monthName(month),
      },
      cards: {
        revenue:
          ledger && canMoney && revenueYearTotal
            ? {
                yearTotal: revenueYearTotal,
                ...flowCard(ledger.revenue, ledger.revenueWithoutBase),
              }
            : null,
        activeTenants: activeTenants === null ? null : { count: activeTenants },
        rentedShops: shopStatus
          ? { count: shopStatus.byStatus.rented, total: shopStatus.total }
          : null,
        electricity:
          ledger && canElectricity && electricityOutstanding
            ? {
                collected: flowCard(
                  ledger.electricity,
                  ledger.electricityWithoutBase,
                ),
                outstanding: electricityOutstanding,
              }
            : null,
      },
      shopStatus,
      trend: this.buildTrend(year, {
        revenue: ledger && canMoney ? ledger.revenue : null,
        expenses: expenseDaily?.series ?? null,
        newContracts,
      }),
      expenses: expenseSummary
        ? {
            period: {
              type: period,
              from: expenseRange.from,
              to: expenseRange.to,
            },
            ...expenseSummary,
            recent: recentExpenses ?? [],
          }
        : null,
      warehouse: warehouse
        ? { ...warehouse, recentTransactions: recentInventory ?? [] }
        : null,
    };
  }
}
