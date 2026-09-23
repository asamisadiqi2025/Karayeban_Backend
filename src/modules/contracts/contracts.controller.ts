import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { RentService } from '../rent/rent.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { ContractQueryDto } from './dto/contract-query.dto';
import { TerminateContractDto } from './dto/terminate-contract.dto';
import { SettleContractDto } from './dto/settle-contract.dto';
import { CancelContractDto } from './dto/cancel-contract.dto';
import { RenewContractDto } from './dto/renew-contract.dto';
import { AdjustContractRentDto } from './dto/adjust-contract-rent.dto';
import { DiscountDebtDto } from './dto/discount-debt.dto';
import { PayContractDebtDto } from './dto/pay-contract-debt.dto';
import { ContractExpiryForecastQueryDto } from './dto/contract-expiry-forecast-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { extractRequestMeta } from '../../common/audit-log/request-meta.util';

@Controller('contracts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContractsController {
  constructor(
    private readonly contractsService: ContractsService,
    private readonly rentService: RentService,
  ) {}

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Req() req: any, @Body() dto: CreateContractDto) {
    return this.contractsService.create(req.user, dto, extractRequestMeta(req));
  }

  @Get()
  findAll(@Req() req: any, @Query() query: ContractQueryDto) {
    return this.contractsService.findAll(req.user, query);
  }

  // باید قبل از @Get(':id') ثبت شود، وگرنه Nest کلمهٔ "expiry-forecast" را به‌عنوان :id تطبیق می‌دهد.
  @Get('expiry-forecast')
  getExpiryForecast(@Req() req: any, @Query() query: ContractExpiryForecastQueryDto) {
    return this.contractsService.getExpiryForecast(req.user, query);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.contractsService.findOne(req.user, id);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateContractDto,
  ) {
    return this.contractsService.update(req.user, id, dto, extractRequestMeta(req));
  }

  @Post(':id/cancel')
  @Roles('SUPER_ADMIN', 'ADMIN')
  cancel(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CancelContractDto,
  ) {
    return this.contractsService.cancel(req.user, id, dto, extractRequestMeta(req));
  }

  @Post(':id/renew')
  @Roles('SUPER_ADMIN', 'ADMIN')
  renew(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: RenewContractDto,
  ) {
    return this.contractsService.renew(req.user, id, dto, extractRequestMeta(req));
  }

  @Post(':id/adjust-rent')
  @Roles('SUPER_ADMIN', 'ADMIN')
  adjustRent(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: AdjustContractRentDto,
  ) {
    return this.rentService.adjustFutureRent(req.user, id, dto, extractRequestMeta(req));
  }

  @Post(':id/discount-debt')
  @Roles('SUPER_ADMIN', 'ADMIN')
  discountDebt(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: DiscountDebtDto,
  ) {
    return this.rentService.discountDebt(req.user, id, dto, extractRequestMeta(req));
  }

  @Post(':id/terminate')
  @Roles('SUPER_ADMIN', 'ADMIN')
  terminate(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: TerminateContractDto,
  ) {
    return this.contractsService.terminate(req.user, id, dto, extractRequestMeta(req));
  }

  @Post(':id/settle')
  @Roles('SUPER_ADMIN', 'ADMIN')
  settle(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: SettleContractDto,
  ) {
    return this.contractsService.settle(req.user, id, dto, extractRequestMeta(req));
  }

  @Post(':id/pay-debt')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
  payDebt(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: PayContractDebtDto,
  ) {
    return this.contractsService.payDebt(req.user, id, dto, extractRequestMeta(req));
  }
}
