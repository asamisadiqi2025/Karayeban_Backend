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
import { FloorsService } from './floors.service';
import { CreateFloorDto } from './dto/create-floor.dto';
import { UpdateFloorDto } from './dto/update-floor.dto';
import { FloorQueryDto } from './dto/floor-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@Controller('floors')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class FloorsController {
  constructor(private readonly floorsService: FloorsService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('floors.manage')
  create(@Req() req: any, @Body() dto: CreateFloorDto) {
    return this.floorsService.create(req.user, dto);
  }

  @Get()
  findAll(@Req() req: any, @Query() query: FloorQueryDto) {
    return this.floorsService.findAll(req.user, query);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.floorsService.findOne(req.user, id);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('floors.manage')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateFloorDto,
  ) {
    return this.floorsService.update(req.user, id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('floors.manage')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.floorsService.remove(req.user, id);
  }
}
