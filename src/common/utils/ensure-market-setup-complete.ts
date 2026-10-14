import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

// جلوی ساخت داده‌های وابسته به مارکت (طبقه، بانک، و بعداً دوکان/مستأجر...) را می‌گیرد
// تا وقتی مارکت هنوز کامل راه‌اندازی نشده (یعنی ارز پایه‌اش تنظیم نشده).
// افزودن ارز و ساخت کاربر ادمین عمداً از این چک مستثنا هستند، چون بدون آن‌ها
// اصلاً راهی برای تکمیل راه‌اندازی مارکت وجود نخواهد داشت.
export async function ensureMarketSetupComplete(
  prisma: PrismaService,
  marketId: string,
): Promise<void> {
  const market = await prisma.market.findUnique({
    where: { id: marketId },
    select: { isSetupComplete: true },
  });
  if (!market) throw new NotFoundException('مارکت یافت نشد');
  if (!market.isSetupComplete) {
    throw new BadRequestException(
      'ابتدا باید راه‌اندازی مارکت تکمیل شود (ارز پایه از پروفایل مارکت تنظیم شود)',
    );
  }
}
