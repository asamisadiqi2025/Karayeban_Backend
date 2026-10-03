export interface PermissionItem {
  key: string;
  label: string;
}

export interface PermissionSection {
  key: string;
  label: string;
  items: PermissionItem[];
}

const crud = (section: string, noun: string): PermissionItem[] => [
  { key: `${section}.view`, label: `دیدن ${noun}` },
  { key: `${section}.create`, label: `ثبت ${noun} جدید` },
  { key: `${section}.update`, label: `ویرایش ${noun}` },
  { key: `${section}.delete`, label: `حذف ${noun}` },
];

// منبعِ حقیقتِ همهٔ «کارهای سیستم». هر کلید باید روی حداقل یک route با @Permission('...')
// گذاشته شده باشد؛ فرانت همین فهرست را به‌صورت چک‌باکس نشان می‌دهد.
export const PERMISSION_CATALOG: PermissionSection[] = [
  {
    key: 'accounts',
    label: 'حساب‌های بانکی و صندوق',
    items: [
      { key: 'accounts.view', label: 'دیدن حساب‌ها و گردش حساب' },
      { key: 'accounts.create', label: 'ساخت حساب' },
      { key: 'accounts.update', label: 'ویرایش حساب' },
      { key: 'accounts.delete', label: 'حذف حساب' },
      { key: 'accounts.transact', label: 'واریز و برداشت از حساب' },
      { key: 'accounts.transfer', label: 'انتقال بین حساب‌ها' },
    ],
  },
  { key: 'floors', label: 'طبقات', items: crud('floors', 'طبقات') },
  { key: 'shops', label: 'دوکان‌ها', items: crud('shops', 'دوکان‌ها') },
  { key: 'tenants', label: 'مستأجرین', items: crud('tenants', 'مستأجرین') },
  { key: 'guarantors', label: 'ضامن‌ها', items: crud('guarantors', 'ضامن‌ها') },
  { key: 'meters', label: 'کنتورها', items: crud('meters', 'کنتورها') },
  {
    key: 'contracts',
    label: 'قراردادها',
    items: [
      { key: 'contracts.view', label: 'دیدن قراردادها' },
      { key: 'contracts.create', label: 'ثبت قرارداد جدید' },
      { key: 'contracts.update', label: 'ویرایش قرارداد' },
      { key: 'contracts.cancel', label: 'لغو قرارداد' },
      { key: 'contracts.renew', label: 'تمدید قرارداد' },
      { key: 'contracts.adjust_rent', label: 'تغییر کرایهٔ قرارداد' },
      { key: 'contracts.discount_debt', label: 'تخفیف بدهی' },
      { key: 'contracts.terminate', label: 'فسخ قرارداد' },
      { key: 'contracts.settle', label: 'تسویهٔ قرارداد' },
      { key: 'contracts.pay_debt', label: 'پرداخت بدهی قرارداد' },
    ],
  },
  {
    key: 'rent',
    label: 'کرایه',
    items: [
      { key: 'rent.view', label: 'دیدن کرایه‌ها، پرداخت‌ها و بدهی‌ها' },
      { key: 'rent.pay', label: 'ثبت پرداخت کرایه' },
    ],
  },
  {
    key: 'electricity',
    label: 'برق',
    items: [
      { key: 'electricity.view', label: 'دیدن بل‌ها، پرداخت‌ها و بدهی برق' },
      { key: 'electricity.create_cycle', label: 'ساخت دورهٔ برق' },
      { key: 'electricity.create_bill', label: 'صدور بل برق' },
      { key: 'electricity.create_payment', label: 'ثبت پرداخت برق' },
    ],
  },
  {
    key: 'expenses',
    label: 'مصارف',
    items: [
      { key: 'expenses.view', label: 'دیدن مصارف و گزارش مصارف' },
      { key: 'expenses.create', label: 'ثبت مصرف' },
      { key: 'expenses.update', label: 'ویرایش مصرف' },
      { key: 'expenses.delete', label: 'حذف مصرف' },
      { key: 'expenses.manage_categories', label: 'مدیریت دسته‌بندی مصارف' },
    ],
  },
  {
    key: 'assets',
    label: 'دارایی‌ها',
    items: [
      ...crud('assets', 'دارایی‌ها'),
      { key: 'assets.manage_categories', label: 'مدیریت دسته‌بندی دارایی‌ها' },
    ],
  },
  { key: 'warehouses', label: 'گدام‌ها', items: crud('warehouses', 'گدام‌ها') },
  {
    key: 'inventory',
    label: 'انبار',
    items: [
      { key: 'inventory.view', label: 'دیدن کالاها، موجودی و تراکنش‌های انبار' },
      { key: 'inventory.manage_categories', label: 'مدیریت دسته‌بندی کالا' },
      { key: 'inventory.manage_units', label: 'مدیریت واحدهای اندازه‌گیری' },
      { key: 'inventory.manage_items', label: 'مدیریت کالاها' },
      { key: 'inventory.create_transaction', label: 'ثبت خرید، فروش و مصرف کالا' },
      { key: 'inventory.transfer', label: 'انتقال کالا بین گدام‌ها' },
    ],
  },
  {
    key: 'shareholders',
    label: 'سهام‌داران',
    items: [
      { key: 'shareholders.view', label: 'دیدن سهام‌داران و تراکنش‌ها' },
      { key: 'shareholders.create', label: 'ثبت سهام‌دار' },
      { key: 'shareholders.update', label: 'ویرایش سهام‌دار' },
      { key: 'shareholders.delete', label: 'حذف سهام‌دار' },
      { key: 'shareholders.set_equity', label: 'تعیین درصد سهام' },
      { key: 'shareholders.transact', label: 'ثبت واریز و برداشت سهام‌دار' },
    ],
  },
  {
    key: 'reports',
    label: 'گزارش‌ها',
    items: [{ key: 'reports.view', label: 'دیدن گزارش‌های مالی' }],
  },
];

export const ALL_PERMISSION_KEYS: string[] = PERMISSION_CATALOG.flatMap((s) =>
  s.items.map((i) => i.key),
);
