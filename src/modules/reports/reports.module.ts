import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { FinancialSummaryService } from './financial-summary.service';
import { AccountBalancesService } from './account-balances.service';
import { RentCollectionService } from './rent-collection.service';
import { ElectricityCollectionService } from './electricity-collection.service';
import { PrismaService } from '../../database/prisma/prisma.service';

@Module({
  controllers: [ReportsController],
  providers: [
    FinancialSummaryService,
    AccountBalancesService,
    RentCollectionService,
    ElectricityCollectionService,
    PrismaService,
  ],
})
export class ReportsModule {}
