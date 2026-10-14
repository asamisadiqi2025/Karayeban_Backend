import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

// یک ارز فقط وقتی قابل‌انتخاب است (ارز پایه، ارز حساب بانکی، نرخ ارز) که همان مارکت
// خودش قبلاً از POST /currencies فعالش کرده باشد — نه هر ارزی که مارکت دیگری فعال کرده.
export async function ensureCurrencyEnabledForMarket(
  prisma: PrismaService,
  marketId: string,
  currencyId: string,
): Promise<void> {
  const link = await prisma.marketCurrency.findUnique({
    where: { marketId_currencyId: { marketId, currencyId } },
  });
  if (!link) {
    throw new BadRequestException(
      'این ارز برای مارکت شما فعال نشده؛ اول آن را از بخش ارزها اضافه کنید',
    );
  }
}
