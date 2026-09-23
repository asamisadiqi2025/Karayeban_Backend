import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { FinancialSummaryService } from './financial-summary.service';
import { FinancialSummaryQueryDto } from './dto/financial-summary-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly financialSummaryService: FinancialSummaryService) {}

  @Get('financials/summary')
  getFinancialSummary(@Req() req: any, @Query() query: FinancialSummaryQueryDto) {
    return this.financialSummaryService.getSummary(req.user, query);
  }
}
