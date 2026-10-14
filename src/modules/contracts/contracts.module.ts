import { Module } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RentModule } from '../rent/rent.module';
import { ElectricityModule } from '../electricity/electricity.module';

@Module({
  imports: [RentModule, ElectricityModule],
  controllers: [ContractsController],
  providers: [ContractsService, PrismaService],
  exports: [ContractsService],
})
export class ContractsModule {}
