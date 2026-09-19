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
import { RentService } from './rent.service';
import { CreateRentPaymentDto } from './dto/create-rent-payment.dto';
import { RentChargeQueryDto } from './dto/rent-charge-query.dto';
import { RentPaymentQueryDto } from './dto/rent-payment-query.dto';
import { RentDebtQueryDto } from './dto/rent-debt-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('rent')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RentController {
  constructor(private readonly rentService: RentService) {}

  // فهرست ثابت برج‌های افغانستان (حمل...حوت) — برای پر کردن دراپ‌داون فیلتر ماه در فرانت.
  @Get('jalali-months')
  getJalaliMonths() {
    return this.rentService.getJalaliMonths();
  }

  @Get('charges')
  findAllCharges(@Req() req: any, @Query() query: RentChargeQueryDto) {
    return this.rentService.findAllCharges(req.user, query);
  }

  @Post('payments')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
  createPayment(@Req() req: any, @Body() dto: CreateRentPaymentDto) {
    return this.rentService.createPayment(req.user, dto);
  }

  @Get('payments')
  findAllPayments(@Req() req: any, @Query() query: RentPaymentQueryDto) {
    return this.rentService.findAllPayments(req.user, query);
  }

  @Get('debts')
  findAllDebts(@Req() req: any, @Query() query: RentDebtQueryDto) {
    return this.rentService.findAllDebts(req.user, query);
  }

  @Get('debts/:tenantId')
  findRentDebt(@Req() req: any, @Param('tenantId') tenantId: string) {
    return this.rentService.findRentDebt(req.user, tenantId);
  }
}
