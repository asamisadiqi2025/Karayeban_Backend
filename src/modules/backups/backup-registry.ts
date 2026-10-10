// منبعِ حقیقتِ «چه چیزی جزوِ داده‌های یک مارکت است». هر مدلِ Prisma باید دقیقاً یک‌جا طبقه‌بندی
// شده باشد: یا در BACKUP_REGISTRY (با نحوهٔ محدود شدن به یک مارکت)، یا در EXCLUDED_MODELS
// (مثلاً توکن‌ها). اگر مدلِ تازه‌ای اضافه شود و اینجا نیاید، سرور بالا نمی‌آید (ن.ک.
// assertRegistryComplete) — تا هیچ جدولی بی‌صدا از بک‌آپ جا نماند یا بین مارکت‌ها نشت نکند.

export type BackupScope =
  // مدلی که ستونِ marketId دارد (چه الزامی، چه اختیاری — ردیف‌های marketId=null هرگز نمی‌آیند).
  | { kind: 'market' }
  // خودِ ردیفِ Market.
  | { kind: 'self' }
  // مدلی که marketId ندارد و فقط از طریقِ رابطه‌اش با یک مدلِ مارکت‌دار به مارکت وصل است.
  | { kind: 'child'; via: string };

export interface BackupEntry {
  model: string;
  scope: BackupScope;
  // فیلدهای محرمانه که هرگز وارد فایل نمی‌شوند.
  omit?: string[];
}

const market = (model: string, omit?: string[]): BackupEntry => ({ model, scope: { kind: 'market' }, omit });
const child = (model: string, via: string): BackupEntry => ({ model, scope: { kind: 'child', via } });

export const BACKUP_REGISTRY: BackupEntry[] = [
  { model: 'Market', scope: { kind: 'self' } },
  market('CustomRole'),
  // رمزِ هش‌شده و توکن‌ها هرگز در فایل نیستند؛ هنگامِ بازگردانی ابزار رمزِ فعلیِ کاربرانِ موجود را
  // نگه می‌دارد و بقیه را قفل می‌کند (ن.ک. scripts/backup).
  market('User', ['passwordHash', 'refreshToken', 'refreshTokenExpiry', 'passwordChangedAt']),
  market('MarketCurrency'),
  market('ExchangeRate'),
  market('Account'),
  market('OpeningBalance'),
  market('AccountTransaction'),
  market('AccountTransfer'),
  market('Floor'),
  market('Shop'),
  market('ShopGroup'),
  child('ShopGroupMember', 'group'),
  market('Tenant'),
  market('Guarantor'),
  market('ElectricityMeter'),
  market('Contract'),
  child('ContractShop', 'contract'),
  child('ContractStatusHistory', 'contract'),
  child('ContractSettlement', 'contract'),
  market('RentCharges'),
  market('RentPayment'),
  child('RentPaymentAllocation', 'payment'),
  child('RentDebt', 'tenant'),
  market('ElectricityBillingCycle'),
  market('ElectricityBill'),
  market('ElectricityPayment'),
  child('ElectricityPaymentAllocation', 'payment'),
  child('ElectricityDebt', 'tenant'),
  market('ExpenseCategory'),
  market('Expense'),
  market('AssetCategory'),
  market('Asset'),
  child('DepreciationEvent', 'asset'),
  market('Warehouse'),
  market('InventoryCategory'),
  market('InventoryUnit'),
  market('InventoryItem'),
  market('InventoryTransaction'),
  market('Shareholder'),
  child('ShareholderEquity', 'shareholder'),
  market('ShareholderTransaction'),
  market('Dealer'),
  market('DealerLoan'),
  market('DealerRepayment'),
  market('CollateralItem'),
  market('MiscellaneousIncome'),
  market('LotteryDraw'),
  child('LotteryEntry', 'draw'),
  child('LotteryPrize', 'draw'),
  market('LedgerEntry'),
  market('AuditLog'),
];

// مدل‌هایی که عمداً در بک‌آپ نیستند.
export const EXCLUDED_MODELS: Record<string, string> = {
  Currency: 'کاتالوگِ سراسریِ ارزها (مالِ هیچ مارکتی نیست و در دیتابیس باقی می‌ماند)',
  RefreshToken: 'محرمانه (نشست‌های ورود)',
  PasswordResetToken: 'محرمانه (توکنِ بازیابیِ رمز)',
  MarketBackup: 'متادیتای خودِ بک‌آپ‌ها',
  IdempotencyKey: 'کلیدهای تکرارگیریِ موقت (۴۸ ساعته)؛ داده‌ٔ تجاری نیست و نباید بازگردانی شود',
};

export function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

// شرطِ Prisma برای «فقط ردیف‌های این مارکت». فرزندها با فیلترِ رابطه‌ای به والدِ مارکت‌دارشان وصل
// می‌شوند (مثلاً ContractShop → { contract: { marketId } }).
export function buildWhere(entry: BackupEntry, marketId: string): Record<string, unknown> {
  switch (entry.scope.kind) {
    case 'self':
      return { id: marketId };
    case 'market':
      return { marketId };
    case 'child':
      return { [entry.scope.via]: { marketId } };
  }
}

export function assertRegistryComplete(allModelNames: string[]): void {
  const classified = new Set([...BACKUP_REGISTRY.map((e) => e.model), ...Object.keys(EXCLUDED_MODELS)]);
  const missing = allModelNames.filter((m) => !classified.has(m));
  const unknown = [...classified].filter((m) => !allModelNames.includes(m));
  const dup = BACKUP_REGISTRY.map((e) => e.model).filter((m, i, a) => a.indexOf(m) !== i);
  if (missing.length || unknown.length || dup.length) {
    throw new Error(
      `backup-registry.ts با مدل‌های Prisma هماهنگ نیست — بدونِ طبقه‌بندی: [${missing.join(', ')}]، ناشناخته: [${unknown.join(', ')}]، تکراری: [${dup.join(', ')}]`,
    );
  }
}
