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
import { ShopsService } from './shops.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { ShopQueryDto } from './dto/shop-query.dto';
import { ShopOccupancyQueryDto } from './dto/shop-occupancy-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@Controller('shops')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('shops.manage')
  create(@Req() req: any, @Body() dto: CreateShopDto) {
    return this.shopsService.create(req.user, dto);
  }

  @Get()
  findAll(@Req() req: any, @Query() query: ShopQueryDto) {
    return this.shopsService.findAll(req.user, query);
  }

  // باید قبل از @Get(':id') ثبت شود، وگرنه Nest کلمهٔ "occupancy-summary" را به‌عنوان :id تطبیق می‌دهد.
  @Get('occupancy-summary')
  getOccupancySummary(@Req() req: any, @Query() query: ShopOccupancyQueryDto) {
    return this.shopsService.getOccupancySummary(req.user, query);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.shopsService.findOne(req.user, id);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('shops.manage')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateShopDto) {
    return this.shopsService.update(req.user, id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('shops.manage')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.shopsService.remove(req.user, id);
  }
}
