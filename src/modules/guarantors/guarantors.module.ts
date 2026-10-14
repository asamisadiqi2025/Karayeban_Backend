import { Module } from '@nestjs/common';
import { GuarantorsService } from './guarantors.service';
import { GuarantorsController } from './guarantors.controller';
import { PrismaService } from '../../database/prisma/prisma.service';

@Module({
  controllers: [GuarantorsController],
  providers: [GuarantorsService, PrismaService],
  exports: [GuarantorsService],
})
export class GuarantorsModule {}
