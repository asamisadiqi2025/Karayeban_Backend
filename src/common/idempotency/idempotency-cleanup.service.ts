import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma/prisma.service';

// کلیدهای تکرارگیری فقط ۴۸ ساعت معنی دارند؛ هر شب منقضی‌شده‌ها پاک می‌شوند تا جدول بزرگ نشود.
@Injectable()
export class IdempotencyCleanupService {
  private readonly logger = new Logger(IdempotencyCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpired() {
    try {
      const { count } = await this.prisma.idempotencyKey.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      if (count > 0)
        this.logger.log(`Purged ${count} expired idempotency keys`);
    } catch (error) {
      // پاک‌سازی حیاتی نیست؛ خطا نباید چیزی را از کار بیندازد.
      this.logger.error(
        'Failed to purge expired idempotency keys',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
