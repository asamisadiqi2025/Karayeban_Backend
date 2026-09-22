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
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantQueryDto } from './dto/tenant-query.dto';
import { TenantStatementQueryDto } from './dto/tenant-statement-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Req() req: any, @Body() dto: CreateTenantDto) {
    return this.tenantsService.create(req.user, dto);
  }

  @Get()
  findAll(@Req() req: any, @Query() query: TenantQueryDto) {
    return this.tenantsService.findAll(req.user, query);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.tenantsService.findOne(req.user, id);
  }

  @Get(':id/statement')
  getStatement(
    @Req() req: any,
    @Param('id') id: string,
    @Query() query: TenantStatementQueryDto,
  ) {
    return this.tenantsService.getStatement(req.user, id, query);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.update(req.user, id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.tenantsService.remove(req.user, id);
  }
}
