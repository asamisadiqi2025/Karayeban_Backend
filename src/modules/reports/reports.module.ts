import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { FinancialSummaryService } from './financial-summary.service';
import { PrismaService } from '../../database/prisma/prisma.service';

@Module({
  controllers: [ReportsController],
  providers: [FinancialSummaryService, PrismaService],
})
export class ReportsModule {}
