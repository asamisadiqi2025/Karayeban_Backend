import { Module } from '@nestjs/common';
import { MiscellaneousIncomeService } from './miscellaneous-income.service';
import { MiscellaneousIncomeController } from './miscellaneous-income.controller';
import { PrismaService } from '../../database/prisma/prisma.service';

@Module({
  controllers: [MiscellaneousIncomeController],
  providers: [MiscellaneousIncomeService, PrismaService],
  exports: [MiscellaneousIncomeService],
})
export class MiscellaneousIncomeModule {}
