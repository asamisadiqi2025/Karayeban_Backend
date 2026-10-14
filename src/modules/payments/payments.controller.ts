import {
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import {
  PaymentListQueryDto,
  PaymentTypeParam,
} from './dto/payment-list-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

// عمداً @Permission ندارد: صفحهٔ «پرداخت‌ها» برای هر کاربرِ واردشدهٔ متصل به بازار باز است و
// PaymentsService خودش هر نوع را با کلیدِ دسترسیِ همان بخش (rent.view / electricity.view) فیلتر
// می‌کند — کسی که یکی را ندارد فقط نوعِ دیگر را می‌بیند، و کسی که هیچ‌کدام را ندارد ۴۰۳ می‌گیرد.
@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // همهٔ پرداخت‌های سیستم (کرایه + برق) در یک فهرست، با فیلتر، جست‌وجو، صفحه‌بندی و جمعِ ارزها.
  @Get()
  findAll(@Req() req: any, @Query() query: PaymentListQueryDto) {
    return this.paymentsService.findAll(req.user, query);
  }

  // جزئیاتِ یک پرداخت: type = rent | electricity (آیدیِ دو جدول جداست، پس نوع صریح می‌آید).
  @Get(':type/:id')
  findOne(
    @Req() req: any,
    @Param('type', new ParseEnumPipe(PaymentTypeParam))
    type: PaymentTypeParam,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.paymentsService.findOne(req.user, type, id);
  }
}
