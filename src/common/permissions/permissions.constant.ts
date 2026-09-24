// فهرست رشته‌های permission که یک CustomRole می‌تواند شامل شود. عمداً یک آرایهٔ ثابت
// است (نه enum پایگاه‌داده) چون CustomRole.permissions در اسکیما یک String[] ساده است —
// این‌جا فقط همان رشته‌ها را اعتبارسنجی/مستندسازی می‌کند تا غلط تایپی بی‌صدا یک permission
// بی‌اثر نسازد.
//
// قاعدهٔ این فایل: هر ردیفی که این‌جاست باید حتماً روی حداقل یک endpoint با
// @RequirePermissions استفاده شده باشد — لیستی که «قابل انتخاب» است ولی هیچ اثری ندارد
// برای ادمینی که دارد نقش می‌سازد گمراه‌کننده است. اگر permission تازه‌ای اضافه می‌کنی،
// همان لحظه سرِ endpoint مربوطه هم وصلش کن.
//
// این لایه فقط برای نقش STAFF معنا دارد. SUPER_ADMIN/ADMIN/ACCOUNTANT همان دسترسیِ
// همیشگی‌شان را از طریق @Roles() دارند و این سیستم روی آن‌ها اثر نمی‌گذارد — تا کاربرانِ
// حسابدارِ موجود با هیچ CustomRoleـی، دسترسیِ فعلی‌شان را از دست ندهند.
//
// چرخهٔ عمرِ قرارداد (ساخت/فسخ/تمدید/تسویه/لغو) هم قابل‌واگذاری است — تصمیمِ این‌که
// کدام STAFF چنین اختیاری بگیرد با ادمینِ همان بازار است، نه یک قفلِ ثابت در کد؛ هر
// کدام از این اکشن‌ها هم مثل بقیه در AuditLog با هویتِ کاملِ عامل ثبت می‌شود.
//
// حذفِ رکورد هم قابل‌واگذاری است — فقط دو استثناءِ ثابت باقی می‌ماند که هیچ‌وقت با
// permission هم باز نمی‌شوند: مدیریتِ خودِ CustomRole (چون یعنی STAFF می‌تواند به خودش
// دسترسی بدهد — تشدید امتیاز کلاسیک) و خواندنِ Audit Trail (ابزار نظارت بر خودِ
// کارمندهاست، نباید در اختیار خودشان باشد). این دو در common/guards/roles.guard و
// audit-logs/custom-roles مستقیم @Roles('SUPER_ADMIN','ADMIN') هستند، نه این‌جا.
export const PERMISSIONS = [
  // هزینه‌ها
  'expenses.create',
  'expenses.update',
  'expenses.delete',
  'expenses.categories.manage',

  // کرایه
  'rent.payments.create',

  // برق
  'electricity.bills.create',
  'electricity.payments.create',

  // حساب‌ها
  'accounts.manage',
  'accounts.transactions.create',
  'accounts.transfer',

  // انبار
  'inventory.items.manage',
  'inventory.transactions.create',
  'inventory.categories.manage',
  'inventory.units.manage',
  'warehouses.manage',

  // سهام‌داران
  'shareholders.transactions.create',
  'shareholders.manage',

  // قراردادها
  'contracts.payments.create',
  'contracts.create',
  'contracts.update',
  'contracts.cancel',
  'contracts.renew',
  'contracts.terminate',
  'contracts.settle',
  'contracts.adjust-rent',
  'contracts.discount-debt',

  // دارایی‌ها
  'assets.manage',

  // مستأجر/ضامن
  'tenants.manage',
  'guarantors.manage',

  // ساختار فیزیکی بازار
  'floors.manage',
  'shops.manage',
  'meters.manage',

  // تنظیمات بازار/ارز
  'market.manage',
  'currencies.manage',

  // فایل آپلود
  'uploads.manage',
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];
