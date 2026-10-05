import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { resolveRateToBase } from '../../common/utils/resolve-rate-to-base';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AccountBalancesQueryDto } from './dto/account-balances-query.dto';

type Actor = { id: string; role: string; marketId: string | null };

// موجودیِ همهٔ حساب‌های یک بازار، گروه‌بندی‌شده بر اساس ارز — یا «همین الان» یا «تا یک
// تاریخ مشخص در گذشته». دو حالت عمداً یک endpoint هستند نه دو تا، چون هر دو دقیقاً
// همان سؤال («موجودی چقدر است؟») را جواب می‌دهند، فقط لحظهٔ مرجع فرق می‌کند.
@Injectable()
export class AccountBalancesService {
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

  async getOverview(currentUser: { id: string }, query: AccountBalancesQueryDto) {
    const actor = await this.getActor(currentUser);
    const marketId = this.resolveMarketId(actor, query.marketId);

    if (actor.role === 'SUPER_ADMIN') {
      const market = await this.prisma.market.findUnique({
        where: { id: marketId },
        select: { id: true },
      });
      if (!market) throw new NotFoundException('بازار یافت نشد');
    }

    const accounts = await this.prisma.account.findMany({
      where: { marketId },
      select: {
        id: true,
        name: true,
        type: true,
        isActive: true,
        currencyId: true,
        balance: true,
        currency: { select: { code: true } },
      },
      orderBy: { name: 'asc' },
    });

    const zero = new Prisma.Decimal(0);
    let balanceById: Map<string, Prisma.Decimal>;

    if (!query.asOfDate) {
      // فست‌پث: balance ازپیش‌محاسبه‌شدهٔ خودِ حساب، بدون لمس LedgerEntry.
      balanceById = new Map(accounts.map((a) => [a.id, a.balance]));
    } else {
      const asOf = new Date(query.asOfDate);
      // «asOfDate» یعنی تا آخرِ همان روز، نه نیمه‌شبِ اولش.
      const asOfExclusive = new Date(asOf);
      asOfExclusive.setUTCDate(asOfExclusive.getUTCDate() + 1);

      const grouped = await this.prisma.ledgerEntry.groupBy({
        by: ['accountId', 'direction'],
        where: { marketId, entryDate: { lt: asOfExclusive } },
        _sum: { amount: true },
      });

      const inOutById = new Map<string, { in: Prisma.Decimal; out: Prisma.Decimal }>();
      for (const row of grouped) {
        const entry = inOutById.get(row.accountId) ?? { in: zero, out: zero };
        const sum = row._sum.amount ?? zero;
        if (row.direction === 'IN') entry.in = sum;
        else entry.out = sum;
        inOutById.set(row.accountId, entry);
      }

      balanceById = new Map(
        accounts.map((a) => {
          const io = inOutById.get(a.id) ?? { in: zero, out: zero };
          return [a.id, io.in.sub(io.out)];
        }),
      );
    }

    const accountRows = accounts.map((a) => ({
      accountId: a.id,
      name: a.name,
      type: a.type,
      isActive: a.isActive,
      currencyId: a.currencyId,
      currencyCode: a.currency.code,
      balance: balanceById.get(a.id) ?? zero,
    }));

    const totalsByCurrency = new Map<string, { currencyId: string; currencyCode: string; total: Prisma.Decimal }>();
    for (const row of accountRows) {
      const entry = totalsByCurrency.get(row.currencyId) ?? {
        currencyId: row.currencyId,
        currencyCode: row.currencyCode,
        total: zero,
      };
      entry.total = entry.total.add(row.balance);
      totalsByCurrency.set(row.currencyId, entry);
    }

    // ارزشِ ارز پایه: «نرخِ ثبت‌شدهٔ مارکت تا تاریخِ گزارش» (asOfDate یا امروز) — این یک ارزش‌گذاریِ روزِ
    // گزارش است، نه هزینهٔ تاریخیِ هر تراکنش (آن در گزارشِ خلاصهٔ مالی است). ارزی که نرخ ندارد در
    // currenciesWithoutRate می‌آید و در مجموع نمی‌آید.
    const market = await this.prisma.market.findUnique({
      where: { id: marketId },
      select: { baseCurrency: { select: { id: true, code: true } } },
    });
    const valuationDate = query.asOfDate ? new Date(query.asOfDate) : new Date();
    const rateByCurrency = new Map<string, Prisma.Decimal | null>();
    if (market?.baseCurrency) {
      for (const currencyId of totalsByCurrency.keys()) {
        try {
          const r = await resolveRateToBase(this.prisma, {
            marketId,
            currencyId,
            date: valuationDate,
            amount: new Prisma.Decimal(1),
          });
          rateByCurrency.set(currencyId, r.exchangeRate);
        } catch {
          rateByCurrency.set(currencyId, null);
        }
      }
    }
    const accountsWithBase = accountRows.map((a) => {
      const rate = rateByCurrency.get(a.currencyId) ?? null;
      return {
        ...a,
        rateToBase: rate,
        balanceInBase: rate ? a.balance.mul(rate).toDecimalPlaces(4) : null,
      };
    });
    const totalInBase = accountsWithBase.reduce(
      (sum, a) => (a.balanceInBase ? sum.add(a.balanceInBase) : sum),
      zero,
    );

    return {
      marketId,
      asOfDate: query.asOfDate ?? null,
      baseCurrency: market?.baseCurrency ?? null,
      valuationDate: valuationDate.toISOString().slice(0, 10),
      accounts: accountsWithBase,
      totalsByCurrency: [...totalsByCurrency.values()],
      totalInBase,
      currenciesWithoutRate: [...totalsByCurrency.values()]
        .filter((t) => market?.baseCurrency && rateByCurrency.get(t.currencyId) === null)
        .map((t) => t.currencyCode),
    };
  }
}
