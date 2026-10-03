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
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehouseQueryDto } from './dto/warehouse-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permission } from '../../common/decorators/permission.decorator';

@Controller('warehouses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Permission('warehouses.create')
  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Req() req: any, @Body() dto: CreateWarehouseDto) {
    return this.warehousesService.create(req.user, dto);
  }

  @Permission('warehouses.view')
  @Get()
  findAll(@Req() req: any, @Query() query: WarehouseQueryDto) {
    return this.warehousesService.findAll(req.user, query);
  }

  @Permission('warehouses.view')
  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.warehousesService.findOne(req.user, id);
  }

  @Permission('warehouses.update')
  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return this.warehousesService.update(req.user, id, dto);
  }

  @Permission('warehouses.delete')
  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.warehousesService.remove(req.user, id);
  }
}
