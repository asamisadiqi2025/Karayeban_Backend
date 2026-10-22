import { Module } from '@nestjs/common';
import { DebtPromisesService } from './debt-promises.service';
import { DebtPromisesController } from './debt-promises.controller';
import { PrismaService } from '../../database/prisma/prisma.service';

@Module({
  controllers: [DebtPromisesController],
  providers: [DebtPromisesService, PrismaService],
  exports: [DebtPromisesService],
})
export class DebtPromisesModule {}
