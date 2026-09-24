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
import { RentDebtAgingQueryDto } from './dto/rent-debt-aging-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { extractRequestMeta } from '../../common/audit-log/request-meta.util';

@Controller('rent')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
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
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'STAFF')
  @RequirePermissions('rent.payments.create')
  createPayment(@Req() req: any, @Body() dto: CreateRentPaymentDto) {
    return this.rentService.createPayment(req.user, dto, extractRequestMeta(req));
  }

  @Get('payments')
  findAllPayments(@Req() req: any, @Query() query: RentPaymentQueryDto) {
    return this.rentService.findAllPayments(req.user, query);
  }

  @Get('debts')
  findAllDebts(@Req() req: any, @Query() query: RentDebtQueryDto) {
    return this.rentService.findAllDebts(req.user, query);
  }

  // باید قبل از @Get('debts/:tenantId') ثبت شود، وگرنه Nest کلمهٔ "aging" را به‌عنوان tenantId تطبیق می‌دهد.
  @Get('debts/aging')
  getDebtAging(@Req() req: any, @Query() query: RentDebtAgingQueryDto) {
    return this.rentService.getDebtAging(req.user, query);
  }

  @Get('debts/:tenantId')
  findRentDebt(@Req() req: any, @Param('tenantId') tenantId: string) {
    return this.rentService.findRentDebt(req.user, tenantId);
  }
}
