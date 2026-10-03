import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DealersService } from './dealers.service';
import { CreateDealerDto } from './dto/create-dealer.dto';
import { UpdateDealerDto } from './dto/update-dealer.dto';
import { DealerQueryDto } from './dto/dealer-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { extractRequestMeta } from '../../common/audit-log/request-meta.util';

@Controller('dealers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
export class DealersController {
  constructor(private readonly dealersService: DealersService) {}

  @Permission('dealers.create')
  @Post()
  create(@Req() req: any, @Body() dto: CreateDealerDto) {
    return this.dealersService.create(req.user, dto, extractRequestMeta(req));
  }

  @Permission('dealers.view')
  @Get()
  findAll(@Req() req: any, @Query() query: DealerQueryDto) {
    return this.dealersService.findAll(req.user, query);
  }

  @Permission('dealers.view')
  @Get(':id')
  findOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.dealersService.findOne(req.user, id);
  }

  @Permission('dealers.view')
  @Get(':id/statement')
  getStatement(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.dealersService.getStatement(req.user, id);
  }

  @Permission('dealers.update')
  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDealerDto,
  ) {
    return this.dealersService.update(req.user, id, dto, extractRequestMeta(req));
  }

  @Permission('dealers.delete')
  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.dealersService.remove(req.user, id, extractRequestMeta(req));
  }
}
