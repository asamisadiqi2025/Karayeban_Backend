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
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@Controller('warehouses')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('warehouses.manage')
  create(@Req() req: any, @Body() dto: CreateWarehouseDto) {
    return this.warehousesService.create(req.user, dto);
  }

  @Get()
  findAll(@Req() req: any, @Query() query: WarehouseQueryDto) {
    return this.warehousesService.findAll(req.user, query);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.warehousesService.findOne(req.user, id);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('warehouses.manage')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return this.warehousesService.update(req.user, id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('warehouses.manage')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.warehousesService.remove(req.user, id);
  }
}
