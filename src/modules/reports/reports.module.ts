import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { FinancialSummaryService } from './financial-summary.service';
import { AccountBalancesService } from './account-balances.service';
import { PrismaService } from '../../database/prisma/prisma.service';

@Module({
  controllers: [ReportsController],
  providers: [FinancialSummaryService, AccountBalancesService, PrismaService],
})
export class ReportsModule {}
