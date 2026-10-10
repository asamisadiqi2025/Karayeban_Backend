import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RentService } from './rent.service';
import { CreateRentPaymentDto } from './dto/create-rent-payment.dto';
import { CreateRentPaymentsBulkDto } from './dto/create-rent-payments-bulk.dto';
import { RentChargeQueryDto } from './dto/rent-charge-query.dto';
import { RentPaymentQueryDto } from './dto/rent-payment-query.dto';
import { RentDebtQueryDto } from './dto/rent-debt-query.dto';
import { RentDebtAgingQueryDto } from './dto/rent-debt-aging-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { extractRequestMeta } from '../../common/audit-log/request-meta.util';
import { IDEMPOTENCY_HEADER, parseIdempotencyKey } from '../../common/idempotency/idempotency';

@Controller('rent')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RentController {
  constructor(private readonly rentService: RentService) {}

  // فهرست ثابت برج‌های افغانستان (حمل...حوت) — برای پر کردن دراپ‌داون فیلتر ماه در فرانت.
  @Get('jalali-months')
  getJalaliMonths() {
    return this.rentService.getJalaliMonths();
  }

  @Permission('rent.view')
  @Get('charges')
  findAllCharges(@Req() req: any, @Query() query: RentChargeQueryDto) {
    return this.rentService.findAllCharges(req.user, query);
  }

  @Permission('rent.pay')
  @Post('payments')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
  createPayment(
    @Req() req: any,
    @Body() dto: CreateRentPaymentDto,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey?: string,
  ) {
    return this.rentService.createPayment(
      req.user,
      dto,
      extractRequestMeta(req),
      parseIdempotencyKey(idempotencyKey),
    );
  }

  // چند کرایه یک‌جا (حداکثر ۱۰) — هر آیتم مستقل؛ خروجی { created, failed } مثل POST /electricity/payments/bulk.
  @Permission('rent.pay')
  @Post('payments/bulk')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
  createPaymentsBulk(
    @Req() req: any,
    @Body() dto: CreateRentPaymentsBulkDto,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey?: string,
  ) {
    return this.rentService.createPaymentsBulk(
      req.user,
      dto,
      extractRequestMeta(req),
      parseIdempotencyKey(idempotencyKey),
    );
  }

  @Permission('rent.view')
  @Get('payments')
  findAllPayments(@Req() req: any, @Query() query: RentPaymentQueryDto) {
    return this.rentService.findAllPayments(req.user, query);
  }

  @Permission('rent.view')
  @Get('debts')
  findAllDebts(@Req() req: any, @Query() query: RentDebtQueryDto) {
    return this.rentService.findAllDebts(req.user, query);
  }

  // باید قبل از @Get('debts/:tenantId') ثبت شود، وگرنه Nest کلمهٔ "aging" را به‌عنوان tenantId تطبیق می‌دهد.
  @Permission('rent.view')
  @Get('debts/aging')
  getDebtAging(@Req() req: any, @Query() query: RentDebtAgingQueryDto) {
    return this.rentService.getDebtAging(req.user, query);
  }

  @Permission('rent.view')
  @Get('debts/:tenantId')
  findRentDebt(@Req() req: any, @Param('tenantId') tenantId: string) {
    return this.rentService.findRentDebt(req.user, tenantId);
  }
}
