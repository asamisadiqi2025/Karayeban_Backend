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
import { ShareholdersService } from './shareholders.service';
import { CreateShareholderDto } from './dto/create-shareholder.dto';
import { UpdateShareholderDto } from './dto/update-shareholder.dto';
import { ShareholderQueryDto } from './dto/shareholder-query.dto';
import { SetShareholderEquityDto } from './dto/set-equity.dto';
import { CreateShareholderTransactionDto } from './dto/create-shareholder-transaction.dto';
import { ShareholderTransactionQueryDto } from './dto/shareholder-transaction-query.dto';
import { ShareholderEquitySummaryQueryDto } from './dto/shareholder-equity-summary-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { extractRequestMeta } from '../../common/audit-log/request-meta.util';

@Controller('shareholders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShareholdersController {
  constructor(private readonly shareholdersService: ShareholdersService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Req() req: any, @Body() dto: CreateShareholderDto) {
    return this.shareholdersService.create(req.user, dto, extractRequestMeta(req));
  }

  // باید قبل از @Get(':id') ثبت شود، وگرنه Nest کلمهٔ "transactions" را :id تفسیر می‌کند.
  @Get('transactions')
  findAllTransactions(@Req() req: any, @Query() query: ShareholderTransactionQueryDto) {
    return this.shareholdersService.findAllTransactions(req.user, query);
  }

  // باید قبل از @Get(':id') ثبت شود، وگرنه Nest کلمهٔ "equity-summary" را :id تفسیر می‌کند.
  @Get('equity-summary')
  getEquitySummary(@Req() req: any, @Query() query: ShareholderEquitySummaryQueryDto) {
    return this.shareholdersService.getEquitySummary(req.user, query);
  }

  @Get()
  findAll(@Req() req: any, @Query() query: ShareholderQueryDto) {
    return this.shareholdersService.findAll(req.user, query);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.shareholdersService.findOne(req.user, id);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateShareholderDto) {
    return this.shareholdersService.update(req.user, id, dto, extractRequestMeta(req));
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.shareholdersService.remove(req.user, id, extractRequestMeta(req));
  }

  @Post(':id/equity')
  @Roles('SUPER_ADMIN', 'ADMIN')
  setEquity(@Req() req: any, @Param('id') id: string, @Body() dto: SetShareholderEquityDto) {
    return this.shareholdersService.setEquity(req.user, id, dto, extractRequestMeta(req));
  }

  @Post(':id/transactions')
  @Roles('SUPER_ADMIN', 'ADMIN')
  createTransaction(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CreateShareholderTransactionDto,
  ) {
    return this.shareholdersService.createTransaction(
      req.user,
      id,
      dto,
      extractRequestMeta(req),
    );
  }
}
