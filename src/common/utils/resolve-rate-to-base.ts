import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type Db = Pick<Prisma.TransactionClient, 'market' | 'exchangeRate' | 'currency'>;

// «۱ واحد این ارز = X واحد ارز پایهٔ مارکت» را برای یک تراکنش پولی تعیین می‌کند و معادل
// ارز پایه را حساب می‌کند.
//  - ارز تراکنش همان ارز پایه باشد: نرخ ۱ (نرخ دستی نباید فرستاده شود).
//  - نرخ دستی (manualRate): فقط برای همین یک تراکنش استفاده می‌شود؛ هیچ‌چیز در جدول
//    ExchangeRate (نرخ سیستم) نوشته یا عوض نمی‌شود.
//  - وگرنه آخرین نرخ ثبت‌شدهٔ مارکت تا تاریخ تراکنش؛ اگر تاریخ قبل از اولین نرخ بود،
//    قدیمی‌ترین نرخ ثبت‌شده.
//  - اگر برای این ارز اصلاً نرخی ثبت نشده باشد، تراکنش رد می‌شود.
export async function resolveRateToBase(
  db: Db,
  params: {
    marketId: string;
    currencyId: string;
    date: Date;
    amount: Prisma.Decimal;
    manualRate?: number | string | Prisma.Decimal | null;
  },
): Promise<{ exchangeRate: Prisma.Decimal; baseCurrencyAmount: Prisma.Decimal }> {
  const { marketId, currencyId, date, amount } = params;
  const hasManual = params.manualRate !== undefined && params.manualRate !== null;

  const market = await db.market.findUnique({
    where: { id: marketId },
    select: { baseCurrencyId: true },
  });
  if (!market?.baseCurrencyId) {
    throw new BadRequestException('ارز پایهٔ مارکت تنظیم نشده است');
  }

  let rate: Prisma.Decimal;
  if (currencyId === market.baseCurrencyId) {
    if (hasManual) {
      throw new BadRequestException(
        'ارز این تراکنش همان ارز پایهٔ مارکت است؛ نرخ تبدیل نباید ارسال شود',
      );
    }
    rate = new Prisma.Decimal(1);
  } else if (hasManual) {
    rate = new Prisma.Decimal(params.manualRate as number | string | Prisma.Decimal);
    if (!rate.isPositive() || rate.isZero()) {
      throw new BadRequestException('نرخ تبدیل باید بزرگ‌تر از صفر باشد');
    }
  } else {
    const row =
      (await db.exchangeRate.findFirst({
        where: { marketId, currencyId, effectiveDate: { lte: date } },
        orderBy: { effectiveDate: 'desc' },
      })) ??
      (await db.exchangeRate.findFirst({
        where: { marketId, currencyId },
        orderBy: { effectiveDate: 'asc' },
      }));
    if (!row) {
      const currency = await db.currency.findUnique({
        where: { id: currencyId },
        select: { code: true },
      });
      throw new BadRequestException(
        `برای ارز «${currency?.code ?? currencyId}» نرخ تبدیل به ارز پایه ثبت نشده؛ ابتدا از بخش تنظیمات (نرخ ارز) برای این ارز نرخ تعیین کنید`,
      );
    }
    rate = row.rateToBase;
  }

  return { exchangeRate: rate, baseCurrencyAmount: amount.mul(rate).toDecimalPlaces(4) };
}
