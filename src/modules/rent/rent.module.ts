import { Module } from '@nestjs/common';
import { RentService } from './rent.service';
import { RentController } from './rent.controller';
import { PrismaService } from '../../database/prisma/prisma.service';

@Module({
  controllers: [RentController],
  providers: [RentService, PrismaService],
  exports: [RentService],
})
export class RentModule {}
