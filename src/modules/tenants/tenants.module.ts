import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { PrismaService } from '../../database/prisma/prisma.service';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [UploadsModule],
  controllers: [TenantsController],
  providers: [TenantsService, PrismaService],
  exports: [TenantsService],
})
export class TenantsModule {}
