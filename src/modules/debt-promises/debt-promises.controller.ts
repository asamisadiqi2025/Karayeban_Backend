import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { DebtPromisesService } from './debt-promises.service';
import {
  CancelDebtPromiseDto,
  CreateDebtPromiseDto,
  DebtPromiseQueryDto,
  RescheduleDebtPromiseDto,
} from './dto/debt-promise.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { extractRequestMeta } from '../../common/audit-log/request-meta.util';

// تعهدِ پرداخت و فهرستِ پیگیریِ بدهی. ساختنِ خودکارش در POST /contracts/:id/terminate و /renew با
// acknowledgeDebt انجام می‌شود (ContractsService)؛ این‌جا دیدن، ثبتِ دستی، عقب‌انداختنِ تاریخ و لغو است.
@Controller('debt-promises')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DebtPromisesController {
  constructor(private readonly debtPromisesService: DebtPromisesService) {}

  // فهرستِ پیگیری: ?overdue=true فقط عقب‌افتاده‌ها، ?dueWithinDays=7 وعده‌های هفتهٔ آینده.
  @Permission('debt_promises.view')
  @Get()
  findAll(@Req() req: any, @Query() query: DebtPromiseQueryDto) {
    return this.debtPromisesService.findAll(req.user, query);
  }

  @Permission('debt_promises.view')
  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.debtPromisesService.findOne(req.user, id);
  }

  @Permission('contracts.allow_debt')
  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Req() req: any, @Body() dto: CreateDebtPromiseDto) {
    return this.debtPromisesService.create(req.user, dto, extractRequestMeta(req));
  }

  @Permission('contracts.allow_debt')
  @Patch(':id/reschedule')
  @Roles('SUPER_ADMIN', 'ADMIN')
  reschedule(@Req() req: any, @Param('id') id: string, @Body() dto: RescheduleDebtPromiseDto) {
    return this.debtPromisesService.reschedule(req.user, id, dto, extractRequestMeta(req));
  }

  @Permission('contracts.allow_debt')
  @Post(':id/cancel')
  @Roles('SUPER_ADMIN', 'ADMIN')
  cancel(@Req() req: any, @Param('id') id: string, @Body() dto: CancelDebtPromiseDto) {
    return this.debtPromisesService.cancel(req.user, id, dto, extractRequestMeta(req));
  }
}
