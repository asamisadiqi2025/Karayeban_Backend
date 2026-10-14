import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardOverviewQueryDto } from './dto/dashboard-overview-query.dto';
import { DashboardTrendQueryDto } from './dto/dashboard-trend-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

// عمداً @Permission ندارد: داشبورد برای هر کاربرِ واردشده‌ای که به یک بازار وصل است باز است، و
// DashboardService هر ویجت را جداگانه با کلیدِ دسترسیِ همان بخش (reports.view، expenses.view، ...)
// فیلتر می‌کند. ویجتِ ممنوع‌شده null برمی‌گردد، نه ۴۰۳.
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // همهٔ داده‌های کارت‌ها، دونات‌ها و ویجت‌های صفحهٔ داشبورد، در یک درخواست.
  @Get('overview')
  getOverview(@Req() req: any, @Query() query: DashboardOverviewQueryDto) {
    return this.dashboardService.getOverview(req.user, query);
  }

  // روندِ ماهانهٔ ۱۲ برجِ یک سال — برای تعویضِ سالِ نمودار بدونِ دوباره‌گرفتنِ کلِ داشبورد.
  @Get('monthly-trend')
  getMonthlyTrend(@Req() req: any, @Query() query: DashboardTrendQueryDto) {
    return this.dashboardService.getMonthlyTrend(req.user, query);
  }
}
