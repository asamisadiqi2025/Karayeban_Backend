import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { TransferFundsDto } from './dto/transfer-funds.dto';
import { AccountQueryDto } from './dto/account-query.dto';
import { TransferQueryDto } from './dto/transfer-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
  create(@Req() req: any, @Body() dto: CreateAccountDto) {
    return this.accountsService.create(req.user, dto);
  }

  @Post('transfer')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
  transfer(@Req() req: any, @Body() dto: TransferFundsDto) {
    return this.accountsService.transfer(req.user, dto);
  }

  @Get()
  findAll(@Req() req: any, @Query() query: AccountQueryDto) {
    return this.accountsService.findAll(req.user, query);
  }

  // باید قبل از @Get(':id') ثبت شود، وگرنه Nest کلمهٔ "transfer" را به‌عنوان :id تطبیق می‌دهد.
  @Get('transfer')
  findAllTransfers(@Req() req: any, @Query() query: TransferQueryDto) {
    return this.accountsService.findAllTransfers(req.user, query);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.accountsService.findOne(req.user, id);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountsService.update(req.user, id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.accountsService.remove(req.user, id);
  }
}
