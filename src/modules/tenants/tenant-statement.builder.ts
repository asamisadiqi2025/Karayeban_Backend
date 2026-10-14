import { Prisma } from '@prisma/client';
import { KABUL_OFFSET_MINUTES } from '../../common/utils/kabul-date';

// منطقِ خالصِ ساختِ استیتمنتِ مستأجر (بدون دیتابیس و Nest) تا جداگانه تست شود.
// TenantsService.getStatement فقط ردیف‌ها را می‌خواند و به این‌جا می‌دهد.
//
// اصول:
//  - موجودی همیشه از رویدادهای خام و به‌ترتیبِ تاریخ بازمحاسبه می‌شود (نه از یک فیلدِ ذخیره‌شده).
//  - هر ارز یک استیتمنتِ جدا دارد؛ ارزهای مختلف هیچ‌وقت جمع نمی‌خورند.
//  - مثبت = مستأجر بدهکار است، منفی = مستأجر بستانکار است (پیش‌پرداخت/اعتبار).

const DAY_MS = 24 * 60 * 60_000;
const KABUL_OFFSET_MS = KABUL_OFFSET_MINUTES * 60_000;
const ZERO = new Prisma.Decimal(0);

export type StatementEventType =
  'RENT_CHARGE' | 'RENT_PAYMENT' | 'ELECTRICITY_BILL' | 'ELECTRICITY_PAYMENT';

export type StatementEvent = {
  id: string;
  type: StatementEventType;
  // روزِ حسابداریِ رویداد ('YYYY-MM-DD'): برای فاکتور/بل «روزِ تقویمیِ ذخیره‌شده»، برای پرداخت
  // «روزِ کابلِ لحظهٔ پرداخت». ترتیب و مرزِ بازه با همین است، نه با ساعتِ UTC.
  day: string;
  date: Date;
  currencyId: string;
  description: string;
  shopNumber: string | null;
  contractId: string | null;
  // مبلغِ تأثیرگذار روی موجودی (برای فاکتور: خالصِ پس از تخفیف).
  amount: Prisma.Decimal;
  direction: 'DEBIT' | 'CREDIT';
  // فقط RENT_CHARGE: مبلغِ ناخالص و تخفیف (= ناخالص − خالص). منفی یعنی کرایه بالا رفته (تعدیل).
  grossAmount?: Prisma.Decimal;
  discountAmount?: Prisma.Decimal;
  // فقط پرداخت‌ها:
  receiptNumber?: string | null;
  source?: 'BANK' | 'SECURITY_DEPOSIT';
  isOpeningEntry?: boolean;
  // فقط فاکتور/بل: دورهٔ مربوطه.
  periodStart?: Date;
  periodEnd?: Date;
};

export type CurrencyStatement = {
  currencyId: string;
  currencyCode: string | null;
  openingBalance: Prisma.Decimal;
  closingBalance: Prisma.Decimal;
  // DEBIT = مستأجر بدهکار، CREDIT = مستأجر بستانکار، SETTLED = تسویه.
  closingBalanceSide: 'DEBIT' | 'CREDIT' | 'SETTLED';
  totalCharged: Prisma.Decimal; // مجموعِ بدهکاری‌ها (خالص): closing = opening + totalCharged − totalPaid
  totalPaid: Prisma.Decimal;
  // مجموعِ (ناخالص − خالص) فاکتورهای کرایه در بازه؛ منفی یعنی تعدیلِ افزایشی.
  totalDiscounts: Prisma.Decimal;
  transactions: (StatementEvent & { balance: Prisma.Decimal })[];
};

// ───────────────────────── بازهٔ تاریخ ─────────────────────────

export type StatementRange = {
  fromDay: string;
  toDay: string;
  // فاکتورها/بل‌ها «تاریخِ تقویمی» (نیمه‌شبِ UTC) ذخیره می‌شوند → با مرزِ نیمه‌شبِ UTC مقایسه می‌شوند.
  fromCalendar: Date;
  toCalendarExclusive: Date;
  // پرداخت‌ها «لحظهٔ واقعی» هستند → مرزِ روز نیمه‌شبِ کابل است (UTC+04:30)، نه نیمه‌شبِ UTC.
  fromInstant: Date;
  toInstantExclusive: Date;
};

export function resolveStatementRange(
  from: string,
  to: string,
): { range: StatementRange } | { error: 'INVALID_DATE' | 'END_BEFORE_START' } {
  const fromDay = from.slice(0, 10);
  const toDay = to.slice(0, 10);
  const fromCalendar = new Date(`${fromDay}T00:00:00.000Z`);
  const toCalendar = new Date(`${toDay}T00:00:00.000Z`);
  if (
    Number.isNaN(fromCalendar.getTime()) ||
    Number.isNaN(toCalendar.getTime())
  ) {
    return { error: 'INVALID_DATE' };
  }
  if (toCalendar < fromCalendar) return { error: 'END_BEFORE_START' };

  const toCalendarExclusive = new Date(toCalendar.getTime() + DAY_MS);
  return {
    range: {
      fromDay,
      toDay,
      fromCalendar,
      toCalendarExclusive,
      fromInstant: new Date(fromCalendar.getTime() - KABUL_OFFSET_MS),
      toInstantExclusive: new Date(
        toCalendarExclusive.getTime() - KABUL_OFFSET_MS,
      ),
    },
  };
}

const utcDay = (d: Date) => d.toISOString().slice(0, 10);
export const kabulDayOf = (instant: Date) =>
  new Date(instant.getTime() + KABUL_OFFSET_MS).toISOString().slice(0, 10);

// ───────────────────────── ردیف → رویداد ─────────────────────────

type Shop = { shopNumber: string };
type PaymentSource = 'BANK' | 'SECURITY_DEPOSIT';

export type RentChargeRow = {
  id: string;
  contractId: string;
  periodStart: Date;
  periodEnd: Date;
  grossAmount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  currencyId: string;
  shop: Shop;
};
export type RentPaymentRow = {
  id: string;
  contractId: string;
  paymentDate: Date;
  amount: Prisma.Decimal;
  currencyId: string;
  receiptNumber: string | null;
  source: PaymentSource;
  isOpeningEntry: boolean;
  shop: Shop;
};
export type ElectricityBillRow = {
  id: string;
  contractId: string | null;
  periodStart: Date;
  periodEnd: Date;
  periodNumber: number | null;
  totalAmount: Prisma.Decimal;
  currencyId: string;
  shop: Shop;
};
export type ElectricityPaymentRow = {
  id: string;
  paymentDate: Date;
  amount: Prisma.Decimal;
  currencyId: string;
  receiptNumber: string | null;
  source: PaymentSource;
  isOpeningEntry: boolean;
  shop: Shop;
};

const paymentTags = (p: {
  receiptNumber: string | null;
  source: PaymentSource;
  isOpeningEntry: boolean;
}) =>
  `${p.source === 'SECURITY_DEPOSIT' ? ' (از محل امانت)' : ''}${p.isOpeningEntry ? ' (افتتاحیه)' : ''}${
    p.receiptNumber ? ` (رسید ${p.receiptNumber})` : ''
  }`;

// کرایه از «ابتدای» دوره سررسید می‌شود (پیش‌پرداخت) — همان تعریفی که RentService برای بدهی دارد.
export function rentChargeEvent(r: RentChargeRow): StatementEvent {
  return {
    id: r.id,
    type: 'RENT_CHARGE',
    day: utcDay(r.periodStart),
    date: r.periodStart,
    currencyId: r.currencyId,
    description: `فاکتور کرایه — دوکان ${r.shop.shopNumber}`,
    shopNumber: r.shop.shopNumber,
    contractId: r.contractId,
    amount: r.netAmount,
    direction: 'DEBIT',
    grossAmount: r.grossAmount,
    discountAmount: r.grossAmount.sub(r.netAmount),
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
  };
}

export function rentPaymentEvent(p: RentPaymentRow): StatementEvent {
  return {
    id: p.id,
    type: 'RENT_PAYMENT',
    day: kabulDayOf(p.paymentDate),
    date: p.paymentDate,
    currencyId: p.currencyId,
    description: `پرداخت کرایه — دوکان ${p.shop.shopNumber}${paymentTags(p)}`,
    shopNumber: p.shop.shopNumber,
    contractId: p.contractId,
    amount: p.amount,
    direction: 'CREDIT',
    receiptNumber: p.receiptNumber,
    source: p.source,
    isOpeningEntry: p.isOpeningEntry,
  };
}

// بلِ برق وقتی بدهی می‌شود که مصرفِ دوره تمام شده باشد → تاریخِ حسابداری «پایانِ دوره» است
// (نه شروعش: وگرنه استیتمنتِ وسطِ دوره بدهیِ مصرفی را نشان می‌داد که هنوز اتفاق نیفتاده).
export function electricityBillEvent(b: ElectricityBillRow): StatementEvent {
  return {
    id: b.id,
    type: 'ELECTRICITY_BILL',
    day: utcDay(b.periodEnd),
    date: b.periodEnd,
    currencyId: b.currencyId,
    description: `بل برق${b.periodNumber ? ` دورهٔ ${b.periodNumber}` : ''} — دوکان ${b.shop.shopNumber}`,
    shopNumber: b.shop.shopNumber,
    contractId: b.contractId,
    amount: b.totalAmount,
    direction: 'DEBIT',
    periodStart: b.periodStart,
    periodEnd: b.periodEnd,
  };
}

export function electricityPaymentEvent(
  p: ElectricityPaymentRow,
): StatementEvent {
  return {
    id: p.id,
    type: 'ELECTRICITY_PAYMENT',
    day: kabulDayOf(p.paymentDate),
    date: p.paymentDate,
    currencyId: p.currencyId,
    description: `پرداخت برق — دوکان ${p.shop.shopNumber}${paymentTags(p)}`,
    shopNumber: p.shop.shopNumber,
    contractId: null,
    amount: p.amount,
    direction: 'CREDIT',
    receiptNumber: p.receiptNumber,
    source: p.source,
    isOpeningEntry: p.isOpeningEntry,
  };
}

// ───────────────────────── موجودیِ اول دوره ─────────────────────────

export type CurrencySum = { currencyId: string; amount: Prisma.Decimal };

// بدهکاری‌ها (فاکتور کرایه + بل برق) منهای پرداخت‌ها (کرایه + برق) پیش از شروعِ بازه، به‌تفکیکِ ارز.
export function combineOpeningBalances(parts: {
  rentCharged: CurrencySum[];
  rentPaid: CurrencySum[];
  electricityBilled: CurrencySum[];
  electricityPaid: CurrencySum[];
}): Map<string, Prisma.Decimal> {
  const out = new Map<string, Prisma.Decimal>();
  const apply = (rows: CurrencySum[], sign: 1 | -1) => {
    for (const r of rows) {
      const current = out.get(r.currencyId) ?? ZERO;
      out.set(
        r.currencyId,
        sign === 1 ? current.add(r.amount) : current.sub(r.amount),
      );
    }
  };
  apply(parts.rentCharged, 1);
  apply(parts.rentPaid, -1);
  apply(parts.electricityBilled, 1);
  apply(parts.electricityPaid, -1);
  return out;
}

// ───────────────────────── ساختِ استیتمنت ─────────────────────────

// در یک روز: اول بدهکاری‌ها (فاکتور کرایه، بل برق)، بعد پرداخت‌ها — تا پرداختِ همان روز
// موجودی را موقتاً بستانکار نشان ندهد؛ سپس لحظهٔ دقیق و در آخر id برای ترتیبِ قطعی.
const TYPE_RANK: Record<StatementEventType, number> = {
  RENT_CHARGE: 0,
  ELECTRICITY_BILL: 1,
  RENT_PAYMENT: 2,
  ELECTRICITY_PAYMENT: 3,
};

function compareEvents(a: StatementEvent, b: StatementEvent): number {
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  if (TYPE_RANK[a.type] !== TYPE_RANK[b.type])
    return TYPE_RANK[a.type] - TYPE_RANK[b.type];
  const dt = a.date.getTime() - b.date.getTime();
  if (dt !== 0) return dt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildCurrencyStatements(input: {
  events: StatementEvent[];
  openingBalances: Map<string, Prisma.Decimal>;
  currencyCodes: Map<string, string>;
}): CurrencyStatement[] {
  const eventsByCurrency = new Map<string, StatementEvent[]>();
  for (const e of input.events) {
    const list = eventsByCurrency.get(e.currencyId) ?? [];
    list.push(e);
    eventsByCurrency.set(e.currencyId, list);
  }

  const currencyIds = new Set([
    ...eventsByCurrency.keys(),
    ...input.openingBalances.keys(),
  ]);
  const statements: CurrencyStatement[] = [];

  for (const currencyId of currencyIds) {
    const openingBalance = input.openingBalances.get(currencyId) ?? ZERO;
    const events = (eventsByCurrency.get(currencyId) ?? []).sort(compareEvents);
    // ارزی که نه مانده‌ای دارد و نه رویدادی در این بازه، در استیتمنت جایی ندارد.
    if (events.length === 0 && openingBalance.isZero()) continue;

    let balance = openingBalance;
    let totalCharged = ZERO;
    let totalPaid = ZERO;
    let totalDiscounts = ZERO;
    const transactions = events.map((e) => {
      if (e.direction === 'DEBIT') {
        balance = balance.add(e.amount);
        totalCharged = totalCharged.add(e.amount);
      } else {
        balance = balance.sub(e.amount);
        totalPaid = totalPaid.add(e.amount);
      }
      if (e.discountAmount)
        totalDiscounts = totalDiscounts.add(e.discountAmount);
      return { ...e, balance };
    });

    statements.push({
      currencyId,
      currencyCode: input.currencyCodes.get(currencyId) ?? null,
      openingBalance,
      closingBalance: balance,
      closingBalanceSide: balance.isZero()
        ? 'SETTLED'
        : balance.greaterThan(0)
          ? 'DEBIT'
          : 'CREDIT',
      totalCharged,
      totalPaid,
      totalDiscounts,
      transactions,
    });
  }

  return statements.sort(
    (a, b) =>
      (a.currencyCode ?? '').localeCompare(b.currencyCode ?? '') ||
      a.currencyId.localeCompare(b.currencyId),
  );
}

// فیلدهای سطحِ بالای پاسخ (سازگار با نسخهٔ قبلی): اگر مستأجر حداکثر یک ارز دارد همان ارز، وگرنه
// null — چون جمعِ چند ارز بی‌معناست و کلاینت باید از currencies[] بخواند.
export function legacyTopLevel(statements: CurrencyStatement[]) {
  if (statements.length > 1) {
    return {
      isMultiCurrency: true,
      openingBalance: null,
      closingBalance: null,
      totalCharged: null,
      totalPaid: null,
      totalDiscounts: null,
      transactions: [] as CurrencyStatement['transactions'],
    };
  }
  const only = statements[0];
  return {
    isMultiCurrency: false,
    openingBalance: only?.openingBalance ?? ZERO,
    closingBalance: only?.closingBalance ?? ZERO,
    totalCharged: only?.totalCharged ?? ZERO,
    totalPaid: only?.totalPaid ?? ZERO,
    totalDiscounts: only?.totalDiscounts ?? ZERO,
    transactions: only?.transactions ?? [],
  };
}
