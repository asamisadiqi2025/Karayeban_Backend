import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { StorageService } from './storage.service';

// UPLOAD_DIR باید به یک Docker volume وصل باشد (نه دیسکِ ephemeralِ خودِ کانتینر) —
// وگرنه فایل‌ها با هر ری‌استارت/دیپلوی پاک می‌شوند. ن.ک. docker-compose.yml:
// «karayeban_uploads» volume دقیقاً همین مسیر را نگه می‌دارد.
export const UPLOAD_ROOT = resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');

@Injectable()
export class LocalDiskStorageService extends StorageService {
  private readonly logger = new Logger(LocalDiskStorageService.name);

  async save(params: {
    category: string;
    buffer: Buffer;
    extension: string;
  }): Promise<{ url: string; storageKey: string }> {
    const filename = `${randomUUID()}${params.extension}`;
    const storageKey = `${params.category}/${filename}`;
    const dir = join(UPLOAD_ROOT, params.category);
    const filePath = join(dir, filename);

    await mkdir(dir, { recursive: true });
    await writeFile(filePath, params.buffer);

    return { url: `/uploads/${storageKey}`, storageKey };
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await unlink(join(UPLOAD_ROOT, storageKey));
    } catch (e: any) {
      // فایلِ قبلی از قبل نبود یا دستی پاک شده — نباید کل عملیات (مثلاً آپلودِ لوگوی
      // جدید) را متوقف کند، فقط لاگ می‌شود.
      if (e.code !== 'ENOENT') {
        this.logger.warn(`حذف فایل ناموفق بود: ${storageKey} — ${e.message}`);
      }
    }
  }
}
