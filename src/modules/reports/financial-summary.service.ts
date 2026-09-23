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

    const grouped = await this.prisma.ledgerEntry.groupBy({
      by: ['currencyId', 'direction'],
      where: { marketId, entryDate: { gte: from, lt: toExclusive } },
      _sum: { amount: true },
    });

    const currencyIds = [...new Set(grouped.map((g) => g.currencyId))];
    const currencies = currencyIds.length
      ? await this.prisma.currency.findMany({
          where: { id: { in: currencyIds } },
          select: { id: true, code: true },
        })
      : [];
    const currencyCodeById = new Map(currencies.map((c) => [c.id, c.code]));

    const zero = new Prisma.Decimal(0);
    const byCurrency = new Map<
      string,
      {
        currencyId: string;
        currencyCode: string | null;
        totalIn: Prisma.Decimal;
        totalOut: Prisma.Decimal;
      }
    >();

    for (const row of grouped) {
      const entry = byCurrency.get(row.currencyId) ?? {
        currencyId: row.currencyId,
        currencyCode: currencyCodeById.get(row.currencyId) ?? null,
        totalIn: zero,
        totalOut: zero,
      };
      const sum = row._sum.amount ?? zero;
      if (row.direction === 'IN') entry.totalIn = sum;
      else entry.totalOut = sum;
      byCurrency.set(row.currencyId, entry);
    }

    return {
      marketId,
      from: query.from,
      to: query.to,
      byCurrency: [...byCurrency.values()].map((c) => ({
        ...c,
        net: c.totalIn.sub(c.totalOut),
      })),
    };
  }
}
