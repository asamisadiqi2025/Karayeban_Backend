import { Prisma } from '@prisma/client';
import type { PaymentType } from './dto/payment-list-query.dto';

// منطقِ خالصِ ادغامِ دو فهرست (کرایه + برق) و ساختِ جمعِ به‌تفکیکِ ارز — بدون دیتابیس و Nest تا
// جداگانه تست شود.

export type PaymentSortField = 'paymentDate' | 'createdAt';
export const PAYMENT_SORT_FIELDS: readonly PaymentSortField[] = [
  'paymentDate',
  'createdAt',
];

export function resolvePaymentSortField(
  sortBy: string | undefined,
): PaymentSortField {
  return (PAYMENT_SORT_FIELDS as readonly string[]).includes(sortBy ?? '')
    ? (sortBy as PaymentSortField)
    : 'paymentDate';
}

type Ref = { id: string; fullName: string };
type RowCommon = {
  id: string;
  paymentDate: Date;
  createdAt: Date;
  amount: Prisma.Decimal;
  currency: { id: string; code: string };
  paymentMethod: string;
  source: string;
  isOpeningEntry: boolean;
  receiptNumber: string | null;
  notes: string | null;
  exchangeRate: Prisma.Decimal | null;
  baseCurrencyAmount: Prisma.Decimal | null;
  tenant: Ref;
  shop: { id: string; shopNumber: string };
  account: { id: string; name: string } | null;
  collectedBy: Ref | null;
  _count: { allocations: number };
};
export type RentPaymentListRow = RowCommon & { contractId: string };
export type ElectricityPaymentListRow = RowCommon;

export type UnifiedPayment = {
  type: PaymentType;
  id: string;
  paymentDate: Date;
  createdAt: Date;
  amount: Prisma.Decimal;
  currency: { id: string; code: string };
  paymentMethod: string;
  source: string;
  isOpeningEntry: boolean;
  receiptNumber: string | null;
  notes: string | null;
  exchangeRate: Prisma.Decimal | null;
  baseCurrencyAmount: Prisma.Decimal | null;
  tenant: Ref;
  shop: { id: string; shopNumber: string };
  // کرایه: قراردادِ خودِ پرداخت. برق: null (پرداخت از راهِ تخصیص‌هایش به بل‌ها/قراردادها وصل است؛ جزئیات در GET /payments/electricity/:id).
  contractId: string | null;
  account: { id: string; name: string } | null;
  collectedBy: Ref | null;
  allocationsCount: number;
};

function toUnified(
  type: PaymentType,
  row: RowCommon,
  contractId: string | null,
): UnifiedPayment {
  return {
    type,
    id: row.id,
    paymentDate: row.paymentDate,
    createdAt: row.createdAt,
    amount: row.amount,
    currency: row.currency,
    paymentMethod: row.paymentMethod,
    source: row.source,
    isOpeningEntry: row.isOpeningEntry,
    receiptNumber: row.receiptNumber,
    notes: row.notes,
    exchangeRate: row.exchangeRate,
    baseCurrencyAmount: row.baseCurrencyAmount,
    tenant: row.tenant,
    shop: row.shop,
    contractId,
    account: row.account,
    collectedBy: row.collectedBy,
    allocationsCount: row._count.allocations,
  };
}

export const rentToUnified = (row: RentPaymentListRow) =>
  toUnified('RENT', row, row.contractId);
export const electricityToUnified = (row: ElectricityPaymentListRow) =>
  toUnified('ELECTRICITY', row, null);

// ترتیبِ کاملاً قطعی: فیلدِ مرتب‌سازی، بعد id. همان ترتیبی که کوئری‌های هر جدول (orderBy [field, id])
// دارند؛ پس ادغامِ «N ردیفِ اولِ هر جدول» دقیقاً N ردیفِ اولِ کلِ فهرست را می‌دهد.
export function comparePayments(
  a: UnifiedPayment,
  b: UnifiedPayment,
  field: PaymentSortField,
  direction: 'asc' | 'desc',
): number {
  const diff = a[field].getTime() - b[field].getTime();
  const base = diff !== 0 ? diff : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return direction === 'asc' ? base : -base;
}

// «صفحهٔ اول تا صفحهٔ N» از دو فهرستِ مرتب: هرکدام باید حداقل (skip + limit) ردیفِ اولِ خودش را
// داده باشد؛ آن‌وقت ادغام + برش دقیقاً همان صفحهٔ درست از کلِ فهرست است.
export function mergePaymentPage(
  lists: UnifiedPayment[][],
  field: PaymentSortField,
  direction: 'asc' | 'desc',
  skip: number,
  limit: number,
): UnifiedPayment[] {
  return lists
    .flat()
    .sort((a, b) => comparePayments(a, b, field, direction))
    .slice(skip, skip + limit);
}

export type CurrencyGroup = {
  currencyId: string;
  amount: Prisma.Decimal | null;
  count: number;
};

// جمعِ کلِ نتیجهٔ فیلتر (نه فقط همین صفحه) به‌تفکیکِ ارز — ارزهای مختلف هرگز با هم جمع نمی‌شوند.
export function mergeCurrencySummary(
  groups: CurrencyGroup[][],
  codes: Map<string, string>,
) {
  const byCurrency = new Map<
    string,
    { totalAmount: Prisma.Decimal; count: number }
  >();
  for (const group of groups.flat()) {
    const entry = byCurrency.get(group.currencyId) ?? {
      totalAmount: new Prisma.Decimal(0),
      count: 0,
    };
    entry.totalAmount = entry.totalAmount.add(
      group.amount ?? new Prisma.Decimal(0),
    );
    entry.count += group.count;
    byCurrency.set(group.currencyId, entry);
  }
  return [...byCurrency.entries()]
    .map(([currencyId, v]) => ({
      currencyId,
      currencyCode: codes.get(currencyId) ?? null,
      totalAmount: v.totalAmount,
      count: v.count,
    }))
    .sort((a, b) => (a.currencyCode ?? '').localeCompare(b.currencyCode ?? ''));
}
