import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { StorageService } from './storage/storage.service';
import { LocalDiskStorageService } from './storage/local-disk-storage.service';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, { provide: StorageService, useClass: LocalDiskStorageService }],
  exports: [UploadsService],
})
export class UploadsModule {}
