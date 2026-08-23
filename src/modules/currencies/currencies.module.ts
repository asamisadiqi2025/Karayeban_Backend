import { Module } from '@nestjs/common';
import { CurrenciesService } from './currencies.service';
import { CurrenciesController } from './currencies.controller';
import { PrismaService } from '../../database/prisma/prisma.service';

@Module({
  controllers: [CurrenciesController],
  providers: [CurrenciesService, PrismaService],
  exports: [CurrenciesService],
})
export class CurrenciesModule {}
