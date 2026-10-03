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
import { MetersService } from './meters.service';
import { CreateMeterDto } from './dto/create-meter.dto';
import { UpdateMeterDto } from './dto/update-meter.dto';
import { MeterQueryDto } from './dto/meter-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permission } from '../../common/decorators/permission.decorator';

@Controller('meters')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MetersController {
  constructor(private readonly metersService: MetersService) {}

  @Permission('meters.create')
  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Req() req: any, @Body() dto: CreateMeterDto) {
    return this.metersService.create(req.user, dto);
  }

  @Permission('meters.view')
  @Get()
  findAll(@Req() req: any, @Query() query: MeterQueryDto) {
    return this.metersService.findAll(req.user, query);
  }

  @Permission('meters.view')
  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.metersService.findOne(req.user, id);
  }

  @Permission('meters.update')
  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateMeterDto) {
    return this.metersService.update(req.user, id, dto);
  }

  @Permission('meters.delete')
  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.metersService.remove(req.user, id);
  }
}
