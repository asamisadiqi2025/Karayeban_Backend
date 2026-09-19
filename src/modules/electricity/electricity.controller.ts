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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('electricity')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ElectricityController {
  constructor(private readonly electricityService: ElectricityService) {}

  @Post('bills')
  @Roles('SUPER_ADMIN', 'ADMIN')
  createBill(@Req() req: any, @Body() dto: CreateElectricityBillDto) {
    return this.electricityService.createBill(req.user, dto);
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

  @Get('payments')
  findAllPayments(@Req() req: any, @Query() query: ElectricityPaymentQueryDto) {
    return this.electricityService.findAllPayments(req.user, query);
  }

  @Get('debts')
  findAllDebts(@Req() req: any, @Query() query: ElectricityDebtQueryDto) {
    return this.electricityService.findAllDebts(req.user, query);
  }

  @Get('debts/:tenantId')
  findDebt(@Req() req: any, @Param('tenantId') tenantId: string) {
    return this.electricityService.findDebt(req.user, tenantId);
  }
}
