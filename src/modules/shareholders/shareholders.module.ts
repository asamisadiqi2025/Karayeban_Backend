import { Module } from '@nestjs/common';
import { ShareholdersService } from './shareholders.service';
import { ShareholdersController } from './shareholders.controller';
import { PrismaService } from '../../database/prisma/prisma.service';

@Module({
  controllers: [ShareholdersController],
  providers: [ShareholdersService, PrismaService],
  exports: [ShareholdersService],
})
export class ShareholdersModule {}
