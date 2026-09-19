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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

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
    return this.contractsService.create(req.user, dto);
  }

  @Get()
  findAll(@Req() req: any, @Query() query: ContractQueryDto) {
    return this.contractsService.findAll(req.user, query);
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
    return this.contractsService.update(req.user, id, dto);
  }

  @Post(':id/cancel')
  @Roles('SUPER_ADMIN', 'ADMIN')
  cancel(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CancelContractDto,
  ) {
    return this.contractsService.cancel(req.user, id, dto);
  }

  @Post(':id/renew')
  @Roles('SUPER_ADMIN', 'ADMIN')
  renew(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: RenewContractDto,
  ) {
    return this.contractsService.renew(req.user, id, dto);
  }

  @Post(':id/adjust-rent')
  @Roles('SUPER_ADMIN', 'ADMIN')
  adjustRent(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: AdjustContractRentDto,
  ) {
    return this.rentService.adjustFutureRent(req.user, id, dto);
  }

  @Post(':id/terminate')
  @Roles('SUPER_ADMIN', 'ADMIN')
  terminate(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: TerminateContractDto,
  ) {
    return this.contractsService.terminate(req.user, id, dto);
  }

  @Post(':id/settle')
  @Roles('SUPER_ADMIN', 'ADMIN')
  settle(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: SettleContractDto,
  ) {
    return this.contractsService.settle(req.user, id, dto);
  }
}
