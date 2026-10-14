import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { PermissionsService } from './permissions.service';
import { PermissionsController } from './permissions.controller';
import { PermissionsGuard } from './permissions.guard';
import { PrismaService } from '../../database/prisma/prisma.service';

@Module({
  imports: [DiscoveryModule],
  controllers: [PermissionsController],
  providers: [PermissionsService, PermissionsGuard, PrismaService],
  exports: [PermissionsService, PermissionsGuard],
})
export class PermissionsModule {}
