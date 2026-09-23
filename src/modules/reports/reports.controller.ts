import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { FinancialSummaryService } from './financial-summary.service';
import { FinancialSummaryQueryDto } from './dto/financial-summary-query.dto';
import { AccountBalancesService } from './account-balances.service';
import { AccountBalancesQueryDto } from './dto/account-balances-query.dto';
import { RentCollectionService } from './rent-collection.service';
import { RentCollectionQueryDto } from './dto/rent-collection-query.dto';
import { ElectricityCollectionService } from './electricity-collection.service';
import { ElectricityCollectionQueryDto } from './dto/electricity-collection-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(
    private readonly financialSummaryService: FinancialSummaryService,
    private readonly accountBalancesService: AccountBalancesService,
    private readonly rentCollectionService: RentCollectionService,
    private readonly electricityCollectionService: ElectricityCollectionService,
  ) {}

  @Get('financials/summary')
  getFinancialSummary(@Req() req: any, @Query() query: FinancialSummaryQueryDto) {
    return this.financialSummaryService.getSummary(req.user, query);
  }

  @Get('financials/balances')
  getAccountBalances(@Req() req: any, @Query() query: AccountBalancesQueryDto) {
    return this.accountBalancesService.getOverview(req.user, query);
  }

  @Get('rentals/collection-performance')
  getRentCollectionPerformance(@Req() req: any, @Query() query: RentCollectionQueryDto) {
    return this.rentCollectionService.getPerformance(req.user, query);
  }

  @Get('electricity/collection-performance')
  getElectricityCollectionPerformance(
    @Req() req: any,
    @Query() query: ElectricityCollectionQueryDto,
  ) {
    return this.electricityCollectionService.getPerformance(req.user, query);
  }
}
