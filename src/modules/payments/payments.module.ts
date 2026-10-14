import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PermissionsModule } from '../permissions/permissions.module';
import { PrismaService } from '../../database/prisma/prisma.service';

// ماژولِ فقط‌خواندنی: هیچ سرویسِ ماژول‌های کرایه/برق را تغییر نمی‌دهد و فقط جدول‌های پرداخت را می‌خواند.
@Module({
  imports: [PermissionsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PrismaService],
})
export class PaymentsModule {}
