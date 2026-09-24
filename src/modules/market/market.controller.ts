import {
  Controller,
  Post,
  Body,
  UseGuards,
  Patch,
  Param,
  Get,
  Req,
} from '@nestjs/common';
import { MarketService } from './market.service';
import { CreateMarketDto } from './dto/create-market.dto';
import { UpdateMarketProfileDto } from './dto/update-market-profile.dto';
import { UpdateExchangeRateDto } from './dto/update-exchange-rate.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { extractRequestMeta } from '../../common/audit-log/request-meta.util';

@Controller('markets')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Post()
  @Roles('SUPER_ADMIN')
  async create(@Req() req: any, @Body() dto: CreateMarketDto) {
    return this.marketService.create(req.user, dto);
  }

  @Get(':id')
  async findOne(@Req() req: any, @Param('id') id: string) {
    return this.marketService.findOne(req.user, id);
  }

  @Patch(':id/profile')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('market.manage')
  async updateProfile(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateMarketProfileDto,
  ) {
    return this.marketService.updateProfile(req.user, id, dto);
  }

  @Get()
  async list(@Req() req: any) {
    return this.marketService.findAll(req.user);
  }

  @Post(':id/exchange-rates')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('market.manage')
  async setExchangeRate(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateExchangeRateDto,
  ) {
    return this.marketService.setExchangeRate(req.user, id, dto, extractRequestMeta(req));
  }

  @Get(':id/exchange-rates')
  async listExchangeRates(@Req() req: any, @Param('id') id: string) {
    return this.marketService.getExchangeRates(req.user, id);
  }
}
