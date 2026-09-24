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
import { InventoryService } from './inventory.service';
import { CreateInventoryCategoryDto } from './dto/create-inventory-category.dto';
import { UpdateInventoryCategoryDto } from './dto/update-inventory-category.dto';
import { InventoryCategoryQueryDto } from './dto/inventory-category-query.dto';
import { CreateInventoryUnitDto } from './dto/create-inventory-unit.dto';
import { UpdateInventoryUnitDto } from './dto/update-inventory-unit.dto';
import { InventoryUnitQueryDto } from './dto/inventory-unit-query.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { InventoryItemQueryDto } from './dto/inventory-item-query.dto';
import { InventoryItemSummaryQueryDto } from './dto/inventory-item-summary-query.dto';
import { CreateInventoryTransactionDto } from './dto/create-inventory-transaction.dto';
import { CreateInventoryTransferDto } from './dto/create-inventory-transfer.dto';
import { InventoryTransactionQueryDto } from './dto/inventory-transaction-query.dto';
import { StockStatementQueryDto } from './dto/stock-statement-query.dto';
import { InventoryMovementSummaryQueryDto } from './dto/inventory-movement-summary-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { extractRequestMeta } from '../../common/audit-log/request-meta.util';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ---------- Category ----------

  @Post('categories')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('inventory.categories.manage')
  createCategory(@Req() req: any, @Body() dto: CreateInventoryCategoryDto) {
    return this.inventoryService.createCategory(req.user, dto, extractRequestMeta(req));
  }

  @Get('categories')
  findAllCategories(
    @Req() req: any,
    @Query() query: InventoryCategoryQueryDto,
  ) {
    return this.inventoryService.findAllCategories(req.user, query);
  }

  @Get('categories/:id')
  findOneCategory(@Req() req: any, @Param('id') id: string) {
    return this.inventoryService.findOneCategory(req.user, id);
  }

  @Patch('categories/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('inventory.categories.manage')
  updateCategory(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateInventoryCategoryDto,
  ) {
    return this.inventoryService.updateCategory(req.user, id, dto, extractRequestMeta(req));
  }

  @Delete('categories/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('inventory.categories.manage')
  removeCategory(@Req() req: any, @Param('id') id: string) {
    return this.inventoryService.removeCategory(req.user, id, extractRequestMeta(req));
  }

  // ---------- Unit ----------

  @Post('units')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('inventory.units.manage')
  createUnit(@Req() req: any, @Body() dto: CreateInventoryUnitDto) {
    return this.inventoryService.createUnit(req.user, dto, extractRequestMeta(req));
  }

  @Get('units')
  findAllUnits(@Req() req: any, @Query() query: InventoryUnitQueryDto) {
    return this.inventoryService.findAllUnits(req.user, query);
  }

  @Get('units/:id')
  findOneUnit(@Req() req: any, @Param('id') id: string) {
    return this.inventoryService.findOneUnit(req.user, id);
  }

  @Patch('units/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('inventory.units.manage')
  updateUnit(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateInventoryUnitDto,
  ) {
    return this.inventoryService.updateUnit(req.user, id, dto, extractRequestMeta(req));
  }

  @Delete('units/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('inventory.units.manage')
  removeUnit(@Req() req: any, @Param('id') id: string) {
    return this.inventoryService.removeUnit(req.user, id, extractRequestMeta(req));
  }

  // ---------- Items ----------

  @Post('items')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('inventory.items.manage')
  createItem(@Req() req: any, @Body() dto: CreateInventoryItemDto) {
    return this.inventoryService.createItem(req.user, dto, extractRequestMeta(req));
  }

  // ------- Current Summary Items

   @Get('items/summary')
  getItemsSummary(
    @Req() req: any,
    @Query() query: InventoryItemSummaryQueryDto,
  ) {
    return this.inventoryService.getItemsSummary(req.user, query);
  }

  // گزارش دورهٔ موجودی (موجودی اول دوره + خرید/فروش/مصرف/اصلاح همان بازه + موجودی آخر
  // دوره) — یا با itemId برای یک کالا، یا با warehouseId برای همهٔ کالاهای آن گدام.
  @Get('stock-statement')
  getStockStatement(@Req() req: any, @Query() query: StockStatementQueryDto) {
    return this.inventoryService.getStockStatement(req.user, query);
  }

  // خلاصهٔ حرکتِ انبار در سطحِ کلِ بازار (نه یک جنس، نه یک گدام) — جمعِ خرید/فروش/مصرف/
  // اصلاح/انتقال برای یک بازه.
  @Get('movement-summary')
  getMovementSummary(
    @Req() req: any,
    @Query() query: InventoryMovementSummaryQueryDto,
  ) {
    return this.inventoryService.getMovementSummary(req.user, query);
  }

  @Get('items')
  findAllItems(@Req() req: any, @Query() query: InventoryItemQueryDto) {
    return this.inventoryService.findAllItems(req.user, query);
  }

  @Get('items/:id')
  findOneItem(@Req() req: any, @Param('id') id: string) {
    return this.inventoryService.findOneItem(req.user, id);
  }

  @Patch('items/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('inventory.items.manage')
  updateItem(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateInventoryItemDto,
  ) {
    return this.inventoryService.updateItem(req.user, id, dto, extractRequestMeta(req));
  }

  @Delete('items/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('inventory.items.manage')
  removeItem(@Req() req: any, @Param('id') id: string) {
    return this.inventoryService.removeItem(req.user, id, extractRequestMeta(req));
  }

  // ----------  Transaction (PURCHAGE, SALE, ADJUSTMENT, CONSUMPTION---------

  @Post('transactions')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('inventory.transactions.create')
  createTransaction(
    @Req() req: any,
    @Body() dto: CreateInventoryTransactionDto,
  ) {
    return this.inventoryService.createTransaction(req.user, dto, extractRequestMeta(req));
  }

  @Post('transactions/transfer')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @RequirePermissions('inventory.transactions.create')
  createTransfer(@Req() req: any, @Body() dto: CreateInventoryTransferDto) {
    return this.inventoryService.createTransfer(req.user, dto, extractRequestMeta(req));
  }

  @Get('transactions')
  findAllTransactions(
    @Req() req: any,
    @Query() query: InventoryTransactionQueryDto,
  ) {
    return this.inventoryService.findAllTransactions(req.user, query);
  }

  @Get('transactions/:id')
  findOneTransaction(@Req() req: any, @Param('id') id: string) {
    return this.inventoryService.findOneTransaction(req.user, id);
  }
}
