import { Module } from '@nestjs/common';
import { FloorsController } from './floors.controller';
import { FloorsService } from './floors.service';
import { PrismaService } from '../../database/prisma/prisma.service';

@Module({
  controllers: [FloorsController],
  providers: [FloorsService, PrismaService],
  exports: [FloorsService],
})
export class FloorsModule {}
