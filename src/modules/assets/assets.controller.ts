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
import { AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { AssetQueryDto } from './dto/asset-query.dto';
import { AssetSummaryQueryDto } from './dto/asset-summary-query.dto';
import { AssetDepreciationSummaryQueryDto } from './dto/asset-depreciation-summary-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { extractRequestMeta } from '../../common/audit-log/request-meta.util';

@Controller('assets')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('assets.manage')
  create(@Req() req: any, @Body() dto: CreateAssetDto) {
    return this.assetsService.create(req.user, dto, extractRequestMeta(req));
  }

  // باید قبل از @Get(':id') ثبت شود، وگرنه Nest کلمهٔ "summary" را :id تفسیر می‌کند.
  @Get('summary')
  getSummary(@Req() req: any, @Query() query: AssetSummaryQueryDto) {
    return this.assetsService.getSummary(req.user, query);
  }

  // باید قبل از @Get(':id') ثبت شود، وگرنه Nest کلمهٔ "depreciation-summary" را :id تفسیر می‌کند.
  @Get('depreciation-summary')
  getDepreciationSummary(@Req() req: any, @Query() query: AssetDepreciationSummaryQueryDto) {
    return this.assetsService.getDepreciationSummary(req.user, query);
  }

  @Get()
  findAll(@Req() req: any, @Query() query: AssetQueryDto) {
    return this.assetsService.findAll(req.user, query);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.assetsService.findOne(req.user, id);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('assets.manage')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.assetsService.update(req.user, id, dto, extractRequestMeta(req));
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('assets.manage')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.assetsService.remove(req.user, id, extractRequestMeta(req));
  }
}
