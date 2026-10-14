import { Module } from '@nestjs/common';
import { WarehousesService } from './warehouses.service';
import { WarehousesController } from './warehouses.controller';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { PrismaService } from '../../database/prisma/prisma.service';

@Module({
  controllers: [WarehousesController, InventoryController],
  providers: [WarehousesService, InventoryService, PrismaService],
  exports: [WarehousesService, InventoryService],
})
export class InventoryModule {}
