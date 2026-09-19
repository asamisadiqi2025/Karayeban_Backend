import { Module } from '@nestjs/common';
import { ElectricityService } from './electricity.service';
import { ElectricityController } from './electricity.controller';
import { PrismaService } from '../../database/prisma/prisma.service';

@Module({
  controllers: [ElectricityController],
  providers: [ElectricityService, PrismaService],
  exports: [ElectricityService],
})
export class ElectricityModule {}
