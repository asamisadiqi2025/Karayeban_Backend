import { Module } from '@nestjs/common';
import { MetersService } from './meters.service';
import { MetersController } from './meters.controller';
import { PrismaService } from '../../database/prisma/prisma.service';

@Module({
  controllers: [MetersController],
  providers: [MetersService, PrismaService],
  exports: [MetersService],
})
export class MetersModule {}
