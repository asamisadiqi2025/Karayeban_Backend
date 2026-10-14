import { Module } from '@nestjs/common';
import { IdempotencyCleanupService } from './idempotency-cleanup.service';
import { PrismaService } from '../../database/prisma/prisma.service';

// فقط cron پاک‌سازی؛ خودِ منطقِ idempotency توابعِ خالصی است که سرویس‌ها مستقیم import می‌کنند.
@Module({
  providers: [IdempotencyCleanupService, PrismaService],
})
export class IdempotencyModule {}
