import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ElectricityBillStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ElectricityCollectionQueryDto } from './dto/electricity-collection-query.dto';

type Actor = { id: string; role: string; marketId: string | null };

const MONEY_FIELDS = ['totalAmount', 'paidAmount', 'remainingAmount'] as const;

type MoneySums = Record<(typeof MONEY_FIELDS)[number], Prisma.Decimal>;

function zeroSums(): MoneySums {
  const zero = new Prisma.Decimal(0);
  return { totalAmount: zero, paidAmount: zero, remainingAmount: zero };
}

// عملکردِ جمع‌آوریِ بلِ برق — همان الگوی دقیقِ RentCollectionService، روی ElectricityBill.
// totalAmount/paidAmount/remainingAmount از پیش روی خودِ بل نگه‌داری و همیشه به‌روزند
// (ElectricityService با هر تخصیصِ پرداخت می‌نویسدشان) — پس فقط یک groupBy در سطح
// دیتابیس، نه بازسازی از پرداخت‌های خام. بل‌های CANCELED (اگر روزی این وضعیت استفاده شد)
// از همان WHERE کنار گذاشته می‌شوند تا شمارش/جمع را گمراه نکنند.
@Injectable()
export class ElectricityCollectionService {
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

  async getPerformance(currentUser: { id: string }, query: ElectricityCollectionQueryDto) {
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

    const where: Prisma.ElectricityBillWhereInput = {
      marketId,
      status: { not: ElectricityBillStatus.CANCELED },
      periodStart: { lte: to },
      periodEnd: { gte: from },
      ...(query.shopId ? { shopId: query.shopId } : {}),
    };

    const grouped = await this.prisma.electricityBill.groupBy({
      by: ['currencyId', 'status'],
      where,
      _sum: { totalAmount: true, paidAmount: true, remainingAmount: true },
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
        byStatus: { status: ElectricityBillStatus; count: number; sums: MoneySums }[];
        totals: MoneySums;
        billsCount: number;
      }
    >();

    for (const row of grouped) {
      const bucket = byCurrency.get(row.currencyId) ?? {
        currencyId: row.currencyId,
        currencyCode: currencyCodeById.get(row.currencyId) ?? null,
        byStatus: [],
        totals: zeroSums(),
        billsCount: 0,
      };

      const sums: MoneySums = {
        totalAmount: row._sum.totalAmount ?? new Prisma.Decimal(0),
        paidAmount: row._sum.paidAmount ?? new Prisma.Decimal(0),
        remainingAmount: row._sum.remainingAmount ?? new Prisma.Decimal(0),
      };

      bucket.byStatus.push({ status: row.status, count: row._count, sums });
      bucket.billsCount += row._count;
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
        collectionRate: c.totals.totalAmount.isZero()
          ? null
          : c.totals.paidAmount.div(c.totals.totalAmount),
      })),
    };
  }
}
