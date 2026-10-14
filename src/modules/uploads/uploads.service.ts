import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { StorageService } from './storage/storage.service';
import { detectMimeFromBuffer, MIME_EXTENSIONS } from './file-signature.util';
import { UPLOAD_CATEGORIES, UploadCategory } from './upload-categories';
import { AuditLogService } from '../../common/audit-log/audit-log.service';
import { RequestMeta } from '../../common/audit-log/request-meta.util';

@Injectable()
export class UploadsService {
  constructor(
    @Inject(StorageService) private readonly storage: StorageService,
    private readonly auditLog: AuditLogService,
  ) {}

  // امضای واقعیِ فایل (magic bytes) منبع حقیقتِ نوعِ فایل است، نه mimetype ادعاشده توسط
  // کلاینت و نه پسوندِ نامِ اصلی — هر دو به‌راحتی قابل جعل‌اند. نامِ ذخیره‌شده هم همیشه
  // UUID تازه است، هیچ‌وقت نامِ اصلیِ فایل (که می‌تواند مسیر/کاراکترهای خطرناک داشته
  // باشد) مستقیم استفاده نمی‌شود.
  async uploadFile(
    category: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('فایل الزامی است');

    const rules = UPLOAD_CATEGORIES[category as UploadCategory];
    if (!rules) {
      throw new BadRequestException(`دسته‌بندیِ «${category}» معتبر نیست`);
    }

    if (file.size > rules.maxSizeBytes) {
      throw new BadRequestException(
        `حجمِ فایل نباید از ${(rules.maxSizeBytes / (1024 * 1024)).toFixed(1)} مگابایت بیشتر باشد`,
      );
    }

    const realMime = detectMimeFromBuffer(file.buffer);
    if (!realMime || !(rules.allowedMimeTypes as readonly string[]).includes(realMime)) {
      throw new BadRequestException(
        `نوعِ فایل مجاز نیست — فقط ${rules.allowedMimeTypes.join('، ')} پذیرفته می‌شود`,
      );
    }

    const { url } = await this.storage.save({
      category,
      buffer: file.buffer,
      extension: MIME_EXTENSIONS[realMime],
    });

    return { url };
  }

  // برای پاک‌سازیِ دستیِ فایلِ قدیمی (مثلاً وقتی لوگو عوض می‌شود) — فقط storageKey را
  // می‌گیرد (همان بخشِ بعد از «/uploads/» در URL)، نه کلِ URL. چون storageKey از کلاینت
  // می‌آید، دقیقاً باید با همان قالبی که خودمان تولید می‌کنیم (category/UUID.ext) یکی
  // باشد — وگرنه چیزی مثل «market-logos/../../.env» می‌تواند از پوشهٔ آپلود بیرون بزند.
  private static readonly STORAGE_KEY_PATTERN =
    /^([a-z-]+)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|pdf)$/;

  async deleteFile(
    storageKey: string,
    currentUser: { id: string },
    meta: RequestMeta,
  ): Promise<{ message: string }> {
    const match = storageKey.match(UploadsService.STORAGE_KEY_PATTERN);
    if (!match || !UPLOAD_CATEGORIES[match[1] as UploadCategory]) {
      throw new NotFoundException('فایل یافت نشد');
    }
    await this.storage.delete(storageKey);

    // این فایل به هیچ رکورد دیتابیسی گره نخورده (marketId معلوم نیست)، پس با
    // marketId خالی ثبت می‌شود — همان الگوی رویدادهای بدون بازار مثل LOGIN_FAILED.
    await this.auditLog.record({
      action: 'DELETE',
      entityType: 'UploadedFile',
      userId: currentUser.id,
      oldData: { storageKey },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return { message: 'فایل حذف شد' };
  }

  async deleteByUrl(url: string | null | undefined): Promise<void> {
    if (!url || typeof url !== 'string') return;

    const normalized = url.trim();
    if (!normalized.startsWith('/uploads/')) return;

    const storageKey = normalized.replace(/^\/uploads\//, '');
    const match = storageKey.match(UploadsService.STORAGE_KEY_PATTERN);
    if (!match || !UPLOAD_CATEGORIES[match[1] as UploadCategory]) return;

    await this.storage.delete(storageKey);
  }
}
