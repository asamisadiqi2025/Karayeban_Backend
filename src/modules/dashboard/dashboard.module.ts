import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PermissionsModule } from '../permissions/permissions.module';
import { PrismaService } from '../../database/prisma/prisma.service';

@Module({
  imports: [PermissionsModule],
  controllers: [DashboardController],
  providers: [DashboardService, PrismaService],
})
export class DashboardModule {}
