// قراردادِ ذخیره‌سازی — کنترلر/سرویسِ آپلود فقط با همین اینترفیس کار می‌کند، نه با
// جزئیاتِ دیسک یا فضای ابری. اگر روزی به S3/R2 مهاجرت شد، فقط یک پیاده‌سازیِ جدید از
// همین کلاس ساخته می‌شود و در UploadsModule جایگزینِ LocalDiskStorageService می‌شود —
// هیچ ماژولِ دیگری (Market، User، Tenant، Expense) که از URLِ برگشتی استفاده می‌کند
// دست نمی‌خورد.
export abstract class StorageService {
  abstract save(params: {
    category: string;
    buffer: Buffer;
    extension: string;
  }): Promise<{ url: string; storageKey: string }>;

  abstract delete(storageKey: string): Promise<void>;
}
