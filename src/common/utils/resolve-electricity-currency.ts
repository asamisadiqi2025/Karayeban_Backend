import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

// ارزِ پیش‌فرضِ بل‌های برق وقتی بازار ارزِ برق را صراحتاً تعیین نکرده باشد (افغانی).
export const DEFAULT_ELECTRICITY_CURRENCY_CODE = 'AFN';

export type ElectricityCurrency = {
  id: string;
  code: string;
  // MARKET_SETTING: از Market.electricityRateCurrency، DEFAULT: ارزِ پیش‌فرضِ سیستم (AFN).
  source: 'MARKET_SETTING' | 'DEFAULT';
};

// ارزِ «ثابتِ» بل‌های برقِ یک بازار — نرخِ برق (Market.electricityRatePerUnit) فقط یک عدد است و
// ارزِ خودش را همین تعیین می‌کند؛ پس ارز نباید از ورودیِ آزادِ کاربر بیاید، وگرنه ۱۸.۵ افغانی
// می‌تواند به‌اشتباه ۱۸.۵ دالر ثبت شود.
//
// ترتیب: ۱) Market.electricityRateCurrency اگر تنظیم شده، ۲) در غیر این صورت AFN.
// ارزِ نتیجه باید برای همین بازار فعال شده باشد (MarketCurrency)؛ وگرنه خطای روشن می‌دهد.
// فقط ۲ کوئری، هر دو ایندکس‌دار (کلیدِ اصلی/یکتا).
export async function resolveElectricityCurrency(
  prisma: PrismaService,
  marketId: string,
): Promise<ElectricityCurrency> {
  const market = await prisma.market.findUnique({
    where: { id: marketId },
    select: { electricityRateCurrency: { select: { id: true, code: true } } },
  });
  const configured = market?.electricityRateCurrency ?? null;

  const link = configured
    ? await prisma.marketCurrency.findUnique({
        where: { marketId_currencyId: { marketId, currencyId: configured.id } },
        select: { currency: { select: { id: true, code: true } } },
      })
    : await prisma.marketCurrency.findFirst({
        where: {
          marketId,
          currency: { code: DEFAULT_ELECTRICITY_CURRENCY_CODE },
        },
        select: { currency: { select: { id: true, code: true } } },
      });

  if (!link) {
    const code = configured?.code ?? DEFAULT_ELECTRICITY_CURRENCY_CODE;
    throw new BadRequestException(
      `ارزِ بل برق (${code}) برای این بازار فعال نشده؛ اول آن را از بخش ارزها اضافه کنید`,
    );
  }

  return {
    id: link.currency.id,
    code: link.currency.code,
    source: configured ? 'MARKET_SETTING' : 'DEFAULT',
  };
}
