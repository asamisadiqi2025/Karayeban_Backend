import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CurrenciesService } from './currencies.service';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@Controller('currencies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  // فهرست کامل کاتالوگ جهانی ISO — برای جست‌وجو موقع «افزودن ارز»، مستقل از هر مارکت.
  @Get('catalog')
  @Roles('SUPER_ADMIN', 'ADMIN')
  getCatalog(@Query('search') search?: string) {
    return this.currenciesService.getCatalog(search);
  }

  // فقط ارزهایی که همین مارکتِ کاربر جاری فعال کرده (نه فهرست کل سیستم).
  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN')
  getAddedCurrencies(@Req() req: any, @Query() query: PaginationQueryDto) {
    return this.currenciesService.getAddedCurrencies(req.user, query);
  }

  // فعال‌کردن یک ارز برای مارکت کاربر جاری. بدون خطا اگر آن ارز از قبل در کاتالوگ
  // جهانی بود (idempotent) — فقط لینک «فعال‌بودن» برای همین مارکت اضافه/تکرار می‌شود.
  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  addCurrency(@Req() req: any, @Body() dto: CreateCurrencyDto) {
    return this.currenciesService.addCurrency(req.user, dto);
  }

  // غیرفعال‌کردن یک ارز فقط برای مارکت کاربر جاری — ارز همچنان در کاتالوگ جهانی و برای
  // مارکت‌های دیگر باقی می‌ماند. فقط با استفادهٔ همین مارکت از این ارز چک می‌شود.
  @Delete(':id/market')
  @Roles('SUPER_ADMIN', 'ADMIN')
  removeCurrencyFromMarket(
    @Req() req: any,
    @Param('id') id: string,
    @Query('marketId') marketId?: string,
  ) {
    return this.currenciesService.removeCurrencyFromMarket(
      req.user,
      id,
      marketId,
    );
  }

  // حذف سراسری ارز از کل سیستم — فقط سوپرادمین، و فقط اگر هیچ مارکتی (نه فقط مارکت
  // خودتان) آن را استفاده نکند.
  @Delete(':id')
  @Roles('SUPER_ADMIN')
  deleteCurrency(@Param('id') id: string) {
    return this.currenciesService.deleteCurrency(id);
  }
}
