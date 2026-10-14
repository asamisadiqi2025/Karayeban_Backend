import { Module } from '@nestjs/common';
import { MarketService } from './market.service';
import { MarketController } from './market.controller';
import { PrismaService } from '../../database/prisma/prisma.service';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [UploadsModule],
  controllers: [MarketController],
  providers: [MarketService, PrismaService],
  exports: [MarketService],
})
export class MarketModule {}
