import { Module } from '@nestjs/common';
import { MarketBackupsController } from './market-backups.controller';
import { MarketBackupsService } from './market-backups.service';
import { PrismaService } from '../../database/prisma/prisma.service';

@Module({
  controllers: [MarketBackupsController],
  providers: [MarketBackupsService, PrismaService],
  exports: [MarketBackupsService],
})
export class BackupsModule {}
