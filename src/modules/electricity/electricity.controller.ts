import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ElectricityService } from './electricity.service';
import { CreateElectricityBillDto } from './dto/create-electricity-bill.dto';
import { ElectricityBillQueryDto } from './dto/electricity-bill-query.dto';
import { CreateElectricityPaymentDto } from './dto/create-electricity-payment.dto';
import { ElectricityPaymentQueryDto } from './dto/electricity-payment-query.dto';
import { ElectricityDebtQueryDto } from './dto/electricity-debt-query.dto';
import { CreateElectricityBillingCycleDto } from './dto/create-electricity-billing-cycle.dto';
import { ElectricityBillingCycleQueryDto } from './dto/electricity-billing-cycle-query.dto';
import { CreateElectricityBillsBulkDto } from './dto/create-electricity-bills-bulk.dto';
import { CreateElectricityPaymentsBulkDto } from './dto/create-electricity-payments-bulk.dto';
import { ElectricityDebtAgingQueryDto } from './dto/electricity-debt-aging-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('electricity')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ElectricityController {
  constructor(private readonly electricityService: ElectricityService) {}

  @Post('billing-cycles')
  @Roles('SUPER_ADMIN', 'ADMIN')
  setBillingCycle(
    @Req() req: any,
    @Body() dto: CreateElectricityBillingCycleDto,
  ) {
    return this.electricityService.setBillingCycle(req.user, dto);
  }

  @Get('billing-cycles')
  findBillingCycles(
    @Req() req: any,
    @Query() query: ElectricityBillingCycleQueryDto,
  ) {
    return this.electricityService.findBillingCycles(req.user, query);
  }

  @Post('bills')
  @Roles('SUPER_ADMIN', 'ADMIN')
  createBill(@Req() req: any, @Body() dto: CreateElectricityBillDto) {
    return this.electricityService.createBill(req.user, dto);
  }

  @Post('bills/bulk')
  @Roles('SUPER_ADMIN', 'ADMIN')
  createBillsBulk(@Req() req: any, @Body() dto: CreateElectricityBillsBulkDto) {
    return this.electricityService.createBillsBulk(req.user, dto);
  }

  @Get('bills')
  findAllBills(@Req() req: any, @Query() query: ElectricityBillQueryDto) {
    return this.electricityService.findAllBills(req.user, query);
  }

  @Post('payments')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
  createPayment(@Req() req: any, @Body() dto: CreateElectricityPaymentDto) {
    return this.electricityService.createPayment(req.user, dto);
  }

  @Post('payments/bulk')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
  createPaymentsBulk(
    @Req() req: any,
    @Body() dto: CreateElectricityPaymentsBulkDto,
  ) {
    return this.electricityService.createPaymentsBulk(req.user, dto);
  }

  @Get('payments')
  findAllPayments(@Req() req: any, @Query() query: ElectricityPaymentQueryDto) {
    return this.electricityService.findAllPayments(req.user, query);
  }

  @Get('debts')
  findAllDebts(@Req() req: any, @Query() query: ElectricityDebtQueryDto) {
    return this.electricityService.findAllDebts(req.user, query);
  }

  // باید قبل از @Get('debts/:tenantId') ثبت شود، وگرنه Nest کلمهٔ "aging" را به‌عنوان tenantId تطبیق می‌دهد.
  @Get('debts/aging')
  getDebtAging(@Req() req: any, @Query() query: ElectricityDebtAgingQueryDto) {
    return this.electricityService.getDebtAging(req.user, query);
  }

  @Get('debts/:tenantId')
  findDebt(@Req() req: any, @Param('tenantId') tenantId: string) {
    return this.electricityService.findDebt(req.user, tenantId);
  }
}
