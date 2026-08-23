import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrenciesService } from './currencies.service';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('currencies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  @Get('catalog')
  @Roles('SUPER_ADMIN')
  getCatalog(@Query('search') search?: string) {
    return this.currenciesService.getCatalog(search);
  }

  @Get()
  @Roles('SUPER_ADMIN')
  getAddedCurrencies() {
    return this.currenciesService.getAddedCurrencies();
  }

  @Post()
  @Roles('SUPER_ADMIN')
  addCurrency(@Body() dto: CreateCurrencyDto) {
    return this.currenciesService.addCurrency(dto.code);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  deleteCurrency(@Param('id') id: string) {
    return this.currenciesService.deleteCurrency(id);
  }
}
