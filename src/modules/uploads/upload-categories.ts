// لیستِ سفیدِ دسته‌بندی‌های مجازِ آپلود — هرکدام قوانینِ خودشان (نوع فایل، حداکثر حجم) را
// دارند. اضافه‌کردنِ یک مصرفِ جدید (مثلاً عکسِ یک دارایی) فقط یعنی یک ردیف اینجا اضافه
// شود؛ به کنترلر/سرویس یا هیچ ماژولِ دیگری دست زده نمی‌شود.
export const UPLOAD_CATEGORIES = {
  'market-logos': {
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    maxSizeBytes: 2 * 1024 * 1024,
  },
  'profile-photos': {
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    maxSizeBytes: 2 * 1024 * 1024,
  },
  'tenant-photos': {
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    maxSizeBytes: 2 * 1024 * 1024,
  },
  receipts: {
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
    maxSizeBytes: 5 * 1024 * 1024,
  },
} as const;

export type UploadCategory = keyof typeof UPLOAD_CATEGORIES;

export const UPLOAD_CATEGORY_NAMES = Object.keys(UPLOAD_CATEGORIES) as UploadCategory[];

// سقفِ مطلق برای خودِ multer (پیش از رسیدن به منطقِ دسته‌بندی) — محافظت در برابر
// درخواست‌های حجیمِ مخرب، صرف‌نظر از این‌که دسته‌بندی چه سقفِ دقیق‌تری دارد.
export const ABSOLUTE_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
