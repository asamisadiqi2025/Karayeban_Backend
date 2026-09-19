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
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { InventoryItemQueryDto } from './dto/inventory-item-query.dto';
import { InventoryItemSummaryQueryDto } from './dto/inventory-item-summary-query.dto';
import { CreateInventoryTransactionDto } from './dto/create-inventory-transaction.dto';
import { InventoryTransactionQueryDto } from './dto/inventory-transaction-query.dto';
import { StockStatementQueryDto } from './dto/stock-statement-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ---------- Category ----------

  @Post('categories')
  @Roles('SUPER_ADMIN', 'ADMIN')
  createCategory(@Req() req: any, @Body() dto: CreateInventoryCategoryDto) {
    return this.inventoryService.createCategory(req.user, dto);
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
  @Roles('SUPER_ADMIN', 'ADMIN')
  updateCategory(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateInventoryCategoryDto,
  ) {
    return this.inventoryService.updateCategory(req.user, id, dto);
  }

  @Delete('categories/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  removeCategory(@Req() req: any, @Param('id') id: string) {
    return this.inventoryService.removeCategory(req.user, id);
  }

  // ---------- Items ----------

  @Post('items')
  @Roles('SUPER_ADMIN', 'ADMIN')
  createItem(@Req() req: any, @Body() dto: CreateInventoryItemDto) {
    return this.inventoryService.createItem(req.user, dto);
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

  @Get('items')
  findAllItems(@Req() req: any, @Query() query: InventoryItemQueryDto) {
    return this.inventoryService.findAllItems(req.user, query);
  }

  @Get('items/:id')
  findOneItem(@Req() req: any, @Param('id') id: string) {
    return this.inventoryService.findOneItem(req.user, id);
  }

  @Patch('items/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  updateItem(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateInventoryItemDto,
  ) {
    return this.inventoryService.updateItem(req.user, id, dto);
  }

  @Delete('items/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  removeItem(@Req() req: any, @Param('id') id: string) {
    return this.inventoryService.removeItem(req.user, id);
  }

  // ----------  Transaction (PURCHAGE, SALE, ADJUSTMENT, CONSUMPTION---------

  @Post('transactions')
  @Roles('SUPER_ADMIN', 'ADMIN')
  createTransaction(
    @Req() req: any,
    @Body() dto: CreateInventoryTransactionDto,
  ) {
    return this.inventoryService.createTransaction(req.user, dto);
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
