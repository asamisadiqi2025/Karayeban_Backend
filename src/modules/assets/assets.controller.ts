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
import { AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { CreateAssetCategoryDto } from './dto/create-asset-category.dto';
import { UpdateAssetCategoryDto } from './dto/update-asset-category.dto';
import { AssetCategoryQueryDto } from './dto/asset-category-query.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { AssetQueryDto } from './dto/asset-query.dto';
import { AssetSummaryQueryDto } from './dto/asset-summary-query.dto';
import { AssetDepreciationSummaryQueryDto } from './dto/asset-depreciation-summary-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { extractRequestMeta } from '../../common/audit-log/request-meta.util';

@Controller('assets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Permission('assets.create')
  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Req() req: any, @Body() dto: CreateAssetDto) {
    return this.assetsService.create(req.user, dto, extractRequestMeta(req));
  }

  // باید قبل از @Get(':id') ثبت شود، وگرنه Nest کلمهٔ "summary" را :id تفسیر می‌کند.
  @Permission('assets.view')
  @Get('summary')
  getSummary(@Req() req: any, @Query() query: AssetSummaryQueryDto) {
    return this.assetsService.getSummary(req.user, query);
  }

  // باید قبل از @Get(':id') ثبت شود، وگرنه Nest کلمهٔ "depreciation-summary" را :id تفسیر می‌کند.
  @Permission('assets.view')
  @Get('depreciation-summary')
  getDepreciationSummary(@Req() req: any, @Query() query: AssetDepreciationSummaryQueryDto) {
    return this.assetsService.getDepreciationSummary(req.user, query);
  }

  // ---------- دسته‌بندی دارایی‌ها ----------
  // باید قبل از @Get(':id') ثبت شوند، وگرنه Nest کلمهٔ "categories" را :id تفسیر می‌کند.

  @Permission('assets.manage_categories')
  @Post('categories')
  @Roles('SUPER_ADMIN', 'ADMIN')
  createCategory(@Req() req: any, @Body() dto: CreateAssetCategoryDto) {
    return this.assetsService.createCategory(req.user, dto, extractRequestMeta(req));
  }

  @Permission('assets.view')
  @Get('categories')
  findAllCategories(@Req() req: any, @Query() query: AssetCategoryQueryDto) {
    return this.assetsService.findAllCategories(req.user, query);
  }

  @Permission('assets.manage_categories')
  @Patch('categories/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  updateCategory(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssetCategoryDto,
  ) {
    return this.assetsService.updateCategory(req.user, id, dto, extractRequestMeta(req));
  }

  @Permission('assets.manage_categories')
  @Delete('categories/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  removeCategory(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.assetsService.removeCategory(req.user, id, extractRequestMeta(req));
  }

  @Permission('assets.view')
  @Get()
  findAll(@Req() req: any, @Query() query: AssetQueryDto) {
    return this.assetsService.findAll(req.user, query);
  }

  @Permission('assets.view')
  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.assetsService.findOne(req.user, id);
  }

  @Permission('assets.update')
  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.assetsService.update(req.user, id, dto, extractRequestMeta(req));
  }

  @Permission('assets.delete')
  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.assetsService.remove(req.user, id, extractRequestMeta(req));
  }
}
