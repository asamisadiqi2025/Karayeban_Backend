import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DealerLoansService } from './dealer-loans.service';
import { CreateDealerLoanDto } from './dto/create-dealer-loan.dto';
import { UpdateDealerLoanDto } from './dto/update-dealer-loan.dto';
import { CreateDealerRepaymentDto } from './dto/create-dealer-repayment.dto';
import { DealerLoanQueryDto } from './dto/dealer-loan-query.dto';
import { DealerLoanAlertQueryDto } from './dto/dealer-loan-alert-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { extractRequestMeta } from '../../common/audit-log/request-meta.util';

@Controller('dealer-loans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
export class DealerLoansController {
  constructor(private readonly loansService: DealerLoansService) {}

  @Permission('dealers.lend')
  @Post()
  create(@Req() req: any, @Body() dto: CreateDealerLoanDto) {
    return this.loansService.create(req.user, dto, extractRequestMeta(req));
  }

  // باید قبل از @Get(':id') ثبت شوند، وگرنه Nest کلمهٔ "alerts"/"summary" را :id تفسیر می‌کند.
  @Permission('dealers.view')
  @Get('alerts')
  getAlerts(@Req() req: any, @Query() query: DealerLoanAlertQueryDto) {
    return this.loansService.getAlerts(req.user, query);
  }

  @Permission('dealers.view')
  @Get('summary')
  getSummary(@Req() req: any, @Query() query: DealerLoanAlertQueryDto) {
    return this.loansService.getSummary(req.user, query);
  }

  @Permission('dealers.view')
  @Get()
  findAll(@Req() req: any, @Query() query: DealerLoanQueryDto) {
    return this.loansService.findAll(req.user, query);
  }

  @Permission('dealers.view')
  @Get(':id')
  findOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.loansService.findOne(req.user, id);
  }

  @Permission('dealers.repay')
  @Post(':id/repayments')
  repay(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDealerRepaymentDto,
  ) {
    return this.loansService.repay(req.user, id, dto, extractRequestMeta(req));
  }

  @Permission('dealers.lend')
  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDealerLoanDto,
  ) {
    return this.loansService.update(req.user, id, dto, extractRequestMeta(req));
  }

  @Permission('dealers.delete')
  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.loansService.remove(req.user, id, extractRequestMeta(req));
  }
}
