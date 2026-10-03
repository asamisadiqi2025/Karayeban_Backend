import { Module } from '@nestjs/common';
import { DealersController } from './dealers.controller';
import { DealersService } from './dealers.service';
import { DealerLoansController } from './dealer-loans.controller';
import { DealerLoansService } from './dealer-loans.service';
import { PrismaService } from '../../database/prisma/prisma.service';

@Module({
  controllers: [DealersController, DealerLoansController],
  providers: [DealersService, DealerLoansService, PrismaService],
  exports: [DealersService, DealerLoansService],
})
export class DealersModule {}
