import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RentChargeStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RentCollectionQueryDto } from './dto/rent-collection-query.dto';

type Actor = { id: string; role: string; marketId: string | null };

const MONEY_FIELDS = [
  'grossAmount',
  'discountAmount',
  'netAmount',
  'paidAmount',
  'remainingAmount',
] as const;

type MoneySums = Record<(typeof MONEY_FIELDS)[number], Prisma.Decimal>;

function zeroSums(): MoneySums {
  const zero = new Prisma.Decimal(0);
  return {
    grossAmount: zero,
    discountAmount: zero,
    netAmount: zero,
    paidAmount: zero,
    remainingAmount: zero,
  };
}

// عملکردِ جمع‌آوریِ کرایه — چقدر باید می‌گرفتیم (netAmount) در برابر چقدر واقعاً گرفتیم
// (paidAmount)، برای فاکتورهایی که دورهٔ اجاره‌شان بازهٔ درخواستی را قطع می‌کند. تمامِ
// مبالغ از پیش روی خودِ RentCharges نگه‌داری و همیشه به‌روز می‌شوند (RentService هر بار
// که پرداختی تخصیص/تخفیف/بخشش می‌خورد آن‌ها را می‌نویسد) — پس این گزارش هیچ محاسبه‌ای
// از رویدادهای خام نمی‌کند، فقط یک groupBy در سطح دیتابیس روی ستون‌های ازپیش‌محاسبه‌شده.
// فاکتورهای CANCELED (چیزی که هیچ‌وقت واقعاً بدهکاری نبوده — مثلاً بعد از فسخِ زودهنگام
// قرارداد) عمداً از همان WHERE کنار گذاشته می‌شوند، نه فقط از مخرجِ نرخِ وصولی؛ وگرنه در
// شمارشِ فاکتورها هم ظاهر می‌شدند و عدد را گمراه‌کننده می‌کردند.
@Injectable()
export class RentCollectionService {
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

  async getPerformance(currentUser: { id: string }, query: RentCollectionQueryDto) {
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

    if (query.shopId) {
      const shop = await this.prisma.shop.findUnique({
        where: { id: query.shopId },
        select: { marketId: true },
      });
      if (!shop || shop.marketId !== marketId) {
        throw new NotFoundException('دوکان یافت نشد');
      }
    }

    const where: Prisma.RentChargesWhereInput = {
      marketId,
      status: { not: RentChargeStatus.CANCELED },
      // همپوشانیِ دورهٔ فاکتور با بازهٔ درخواستی — نه اینکه فاکتور دقیقاً داخل بازه صادر شده باشد.
      periodStart: { lte: to },
      periodEnd: { gte: from },
      ...(query.shopId ? { shopId: query.shopId } : {}),
    };

    const grouped = await this.prisma.rentCharges.groupBy({
      by: ['currencyId', 'status'],
      where,
      _sum: {
        grossAmount: true,
        discountAmount: true,
        netAmount: true,
        paidAmount: true,
        remainingAmount: true,
      },
      _count: true,
    });

    const currencyIds = [...new Set(grouped.map((g) => g.currencyId))];
    const currencies = currencyIds.length
      ? await this.prisma.currency.findMany({
          where: { id: { in: currencyIds } },
          select: { id: true, code: true },
        })
      : [];
    const currencyCodeById = new Map(currencies.map((c) => [c.id, c.code]));

    const byCurrency = new Map<
      string,
      {
        currencyId: string;
        currencyCode: string | null;
        byStatus: { status: RentChargeStatus; count: number; sums: MoneySums }[];
        totals: MoneySums;
        chargesCount: number;
      }
    >();

    for (const row of grouped) {
      const bucket = byCurrency.get(row.currencyId) ?? {
        currencyId: row.currencyId,
        currencyCode: currencyCodeById.get(row.currencyId) ?? null,
        byStatus: [],
        totals: zeroSums(),
        chargesCount: 0,
      };

      const sums: MoneySums = {
        grossAmount: row._sum.grossAmount ?? new Prisma.Decimal(0),
        discountAmount: row._sum.discountAmount ?? new Prisma.Decimal(0),
        netAmount: row._sum.netAmount ?? new Prisma.Decimal(0),
        paidAmount: row._sum.paidAmount ?? new Prisma.Decimal(0),
        remainingAmount: row._sum.remainingAmount ?? new Prisma.Decimal(0),
      };

      bucket.byStatus.push({ status: row.status, count: row._count, sums });
      bucket.chargesCount += row._count;
      for (const field of MONEY_FIELDS) {
        bucket.totals[field] = bucket.totals[field].add(sums[field]);
      }

      byCurrency.set(row.currencyId, bucket);
    }

    return {
      marketId,
      from: query.from,
      to: query.to,
      shopId: query.shopId ?? null,
      byCurrency: [...byCurrency.values()].map((c) => ({
        ...c,
        // نرخِ وصولی = چقدر گرفتیم ÷ چقدر باید می‌گرفتیم. وقتی هیچ فاکتوری نبوده
        // (netAmount صفر)، null برمی‌گردد نه صفر یا تقسیم‌بر‌صفر — یعنی «بی‌معنی»، نه «۰٪».
        collectionRate: c.totals.netAmount.isZero()
          ? null
          : c.totals.paidAmount.div(c.totals.netAmount),
      })),
    };
  }
}
