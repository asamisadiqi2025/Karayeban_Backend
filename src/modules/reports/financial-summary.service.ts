import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { FinancialSummaryQueryDto } from './dto/financial-summary-query.dto';

type Actor = { id: string; role: string; marketId: string | null };

// خلاصهٔ ورود/خروجِ پول یک بازار در یک بازه — منبع حقیقت LedgerEntry است، همان دفتری
// که AccountsService.getStatement هم رویش می‌ایستد، چون هر رویداد پولی (کرایه، برق،
// مصرف، درآمد متفرقه، انتقال بین حساب‌ها، سهام‌دار، فروش وثیقه، خرید/فروش انبار) دقیقاً
// یک ردیف این‌جا می‌سازد. یک groupBy روی (currencyId, direction) — نه fetch+reduce —
// چون جمع باید در سطح دیتابیس انجام شود، نه با خواندن هزاران ردیف در RAM.
@Injectable()
export class FinancialSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  private async getActor(currentUser: { id: string }): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, role: true, marketId: true },
    });
    if (!user) throw new ForbiddenException('کاربر معتبر نیست');
    return user;
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

  async getSummary(currentUser: { id: string }, query: FinancialSummaryQueryDto) {
    const actor = await this.getActor(currentUser);
    const marketId = this.resolveMarketId(actor, query.marketId);

    if (actor.role === 'SUPER_ADMIN') {
      const market = await this.prisma.market.findUnique({
        where: { id: marketId },
        select: { id: true },
      });
      if (!market) throw new NotFoundException('بازار یافت نشد');
    }

    const from = new Date(query.from);
    const to = new Date(query.to);
    if (to < from) {
      throw new BadRequestException('تاریخ پایان باید بعد یا برابر تاریخ شروع باشد');
    }
    // «to» یعنی تا آخرِ همان روز، نه نیمه‌شبِ اولش — وگرنه رویدادهای همان روز جا می‌مانند.
    const toExclusive = new Date(to);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

    const where = { marketId, entryDate: { gte: from, lt: toExclusive } };
    const [grouped, missingByCurrency, market, bySourceRows] = await Promise.all([
      this.prisma.ledgerEntry.groupBy({
        by: ['currencyId', 'direction'],
        where,
        _sum: { amount: true, baseCurrencyAmount: true },
      }),
      // ردیف‌هایی که معادلِ ارز پایه ندارند (قدیمی‌ها، قبل از ثبتِ نرخ) — تا مدیر بداند مجموعِ
      // ارز پایه کامل نیست.
      this.prisma.ledgerEntry.groupBy({
        by: ['currencyId'],
        where: { ...where, baseCurrencyAmount: null },
        _count: { _all: true },
      }),
      this.prisma.market.findUnique({
        where: { id: marketId },
        select: { baseCurrency: { select: { id: true, code: true } } },
      }),
      this.prisma.$queryRaw<
        { source: string; direction: string; entries: number; base_total: string; without_base: number }[]
      >(Prisma.sql`
        SELECT CASE
                 WHEN rent_payment_id IS NOT NULL THEN 'RENT_PAYMENT'
                 WHEN electricity_payment_id IS NOT NULL THEN 'ELECTRICITY_PAYMENT'
                 WHEN expense_id IS NOT NULL THEN 'EXPENSE'
                 WHEN miscellaneous_income_id IS NOT NULL THEN 'MISCELLANEOUS_INCOME'
                 WHEN shareholder_transaction_id IS NOT NULL THEN 'SHAREHOLDER_TRANSACTION'
                 WHEN account_transfer_id IS NOT NULL THEN 'ACCOUNT_TRANSFER'
                 WHEN opening_balance_id IS NOT NULL THEN 'OPENING_BALANCE'
                 WHEN collateral_item_id IS NOT NULL THEN 'COLLATERAL'
                 WHEN inventory_transaction_id IS NOT NULL THEN 'INVENTORY'
                 WHEN account_transaction_id IS NOT NULL THEN 'ACCOUNT_DEPOSIT_WITHDRAWAL'
                 WHEN dealer_loan_id IS NOT NULL THEN 'DEALER_LOAN'
                 WHEN dealer_repayment_id IS NOT NULL THEN 'DEALER_REPAYMENT'
                 ELSE 'OTHER'
               END AS source,
               direction::text AS direction,
               count(*)::int AS entries,
               COALESCE(sum(base_currency_amount), 0)::text AS base_total,
               (count(*) FILTER (WHERE base_currency_amount IS NULL))::int AS without_base
        FROM ledger_entries
        WHERE market_id = ${marketId}::uuid AND entry_date >= ${from} AND entry_date < ${toExclusive}
        GROUP BY 1, 2
        ORDER BY 1, 2`),
    ]);

    const currencyIds = [...new Set(grouped.map((g) => g.currencyId))];
    const currencies = currencyIds.length
      ? await this.prisma.currency.findMany({
          where: { id: { in: currencyIds } },
          select: { id: true, code: true },
        })
      : [];
    const currencyCodeById = new Map(currencies.map((c) => [c.id, c.code]));
    const missingById = new Map(missingByCurrency.map((m) => [m.currencyId, m._count._all]));

    const zero = new Prisma.Decimal(0);
    const byCurrency = new Map<
      string,
      {
        currencyId: string;
        currencyCode: string | null;
        totalIn: Prisma.Decimal;
        totalOut: Prisma.Decimal;
        totalInBase: Prisma.Decimal;
        totalOutBase: Prisma.Decimal;
      }
    >();

    for (const row of grouped) {
      const entry = byCurrency.get(row.currencyId) ?? {
        currencyId: row.currencyId,
        currencyCode: currencyCodeById.get(row.currencyId) ?? null,
        totalIn: zero,
        totalOut: zero,
        totalInBase: zero,
        totalOutBase: zero,
      };
      const sum = row._sum.amount ?? zero;
      const baseSum = row._sum.baseCurrencyAmount ?? zero;
      if (row.direction === 'IN') {
        entry.totalIn = sum;
        entry.totalInBase = baseSum;
      } else {
        entry.totalOut = sum;
        entry.totalOutBase = baseSum;
      }
      byCurrency.set(row.currencyId, entry);
    }

    const currencyRows = [...byCurrency.values()].map((c) => ({
      ...c,
      net: c.totalIn.sub(c.totalOut),
      netInBase: c.totalInBase.sub(c.totalOutBase),
      entriesWithoutBaseValue: missingById.get(c.currencyId) ?? 0,
    }));
    const totalIn = currencyRows.reduce((acc, c) => acc.add(c.totalInBase), zero);
    const totalOut = currencyRows.reduce((acc, c) => acc.add(c.totalOutBase), zero);

    return {
      marketId,
      from: query.from,
      to: query.to,
      // معادلِ ارز پایه با نرخِ «همان روزِ هر رویداد» (اسنپ‌شاتِ ذخیره‌شده روی دفتر کل) جمع می‌خورد،
      // نه با نرخِ امروز.
      baseCurrency: market?.baseCurrency ?? null,
      byCurrency: currencyRows,
      totalsInBase: {
        totalIn,
        totalOut,
        net: totalIn.sub(totalOut),
        // اگر بزرگ‌تر از صفر باشد، مجموعِ بالا ناقص است (رویدادهایی بدونِ نرخ هستند).
        entriesWithoutBaseValue: currencyRows.reduce((n, c) => n + c.entriesWithoutBaseValue, 0),
      },
      // به تفکیکِ نوعِ عملیات (کرایه، مصرف، انتقال، ...) به ارز پایه. «ACCOUNT_TRANSFER» در جمعِ کل
      // یک‌دیگر را خنثی می‌کنند؛ فقط تفاوتِ نرخ (سود/زیانِ ارزی) باقی می‌ماند.
      bySource: bySourceRows.map((r) => ({
        source: r.source,
        direction: r.direction,
        entries: r.entries,
        totalInBase: new Prisma.Decimal(r.base_total),
        entriesWithoutBaseValue: r.without_base,
      })),
    };
  }
}
