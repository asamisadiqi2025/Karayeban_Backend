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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('shops')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Req() req: any, @Body() dto: CreateShopDto) {
    return this.shopsService.create(req.user, dto);
  }

  @Get()
  findAll(@Req() req: any, @Query() query: ShopQueryDto) {
    return this.shopsService.findAll(req.user, query);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.shopsService.findOne(req.user, id);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateShopDto) {
    return this.shopsService.update(req.user, id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.shopsService.remove(req.user, id);
  }
}
