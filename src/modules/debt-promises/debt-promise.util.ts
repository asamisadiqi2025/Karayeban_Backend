import { BadRequestException } from '@nestjs/common';
import {
  DebtPromiseSource,
  DebtPromiseStatus,
  ElectricityBillStatus,
  Prisma,
  RentChargeStatus,
} from '@prisma/client';
import { acquireAdvisoryXactLock } from '../../common/utils/advisory-lock';
import { kabulDate } from '../../common/utils/kabul-date';

// منطقِ تعهدِ پرداخت (قولِ پرداختِ بدهی) — توابعِ ساده روی tx تا هم ContractsService (فسخ/تمدید) و هم
// RentService/ElectricityService (بسته‌شدنِ خودکار بعد از پرداخت) بدونِ وابستگیِ حلقه‌ای از آن‌ها استفاده کنند.

type Db = Prisma.TransactionClient;

// عمداً از rent.service/electricity.service import نمی‌شود (آن‌ها خودشان این فایل را import می‌کنند → حلقه).
const RENT_OPEN: RentChargeStatus[] = [
  RentChargeStatus.PENDING,
  RentChargeStatus.PARTIAL,
  RentChargeStatus.OVERDUE,
];
const ELECTRICITY_OPEN: ElectricityBillStatus[] = [
  ElectricityBillStatus.PENDING,
  ElectricityBillStatus.PARTIAL,
  ElectricityBillStatus.OVERDUE,
];

const ZERO = new Prisma.Decimal(0);

export type DebtItem = { id: string; currencyId: string; remaining: Prisma.Decimal };
export type DebtItems = { rent: DebtItem[]; bills: DebtItem[] };
export type SnapshotLine = {
  kind: 'RENT' | 'ELECTRICITY';
  currencyId: string;
  currencyCode: string | null;
  amount: string;
};

// «روزِ تقویمیِ» تاریخِ وعده: فقط ۱۰ حرفِ اول (YYYY-MM-DD) خوانده می‌شود، نیمه‌شبِ UTC. وعدهٔ «امروز» به
// وقتِ کابل مجاز است؛ روزِ گذشته مجاز نیست.
export function parsePromisedDate(value: string | undefined | null, now: Date = new Date()): Date {
  if (!value || !value.trim()) {
    throw new BadRequestException(
      'برای ادامه با بدهیِ باز، تاریخِ قولِ پرداخت (promisedPaymentDate) الزامی است',
    );
  }
  const day = new Date(`${value.trim().slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(day.getTime())) {
    throw new BadRequestException('تاریخِ قولِ پرداخت نامعتبر است');
  }
  if (day.getTime() < kabulDate(now).getTime()) {
    throw new BadRequestException('تاریخِ قولِ پرداخت نمی‌تواند قبل از امروز باشد');
  }
  return day;
}

// بدهیِ بازِ «آن چیزی که این تعهد می‌گیرد».
//  - فسخ/تمدید: کرایهٔ باقی‌ماندهٔ همان قرارداد (rentScope='all' بعد از فسخ؛ 'due' = فقط سررسیدشده برای تمدید)
//    + بل‌های بازِ برقِ همان مستأجر روی همان دوکان.
//  - دستی (wholeTenant): همهٔ کرایهٔ سررسیدشدهٔ مستأجر روی همهٔ قراردادها + همهٔ بل‌های بازِ برقش.
export async function collectDebtItems(
  db: Db,
  p: {
    tenantId: string;
    contractId?: string | null;
    shopId?: string | null;
    rentScope: 'all' | 'due';
    wholeTenant?: boolean;
  },
): Promise<DebtItems> {
  const now = new Date();
  const rent = await db.rentCharges.findMany({
    where: {
      tenantId: p.tenantId,
      status: { in: RENT_OPEN },
      remainingAmount: { gt: 0 },
      ...(p.contractId && !p.wholeTenant ? { contractId: p.contractId } : {}),
      ...(p.rentScope === 'due' || p.wholeTenant ? { periodStart: { lte: now } } : {}),
    },
    select: { id: true, currencyId: true, remainingAmount: true },
  });
  const bills = await db.electricityBill.findMany({
    where: {
      tenantId: p.tenantId,
      status: { in: ELECTRICITY_OPEN },
      remainingAmount: { gt: 0 },
      ...(p.shopId && !p.wholeTenant ? { shopId: p.shopId } : {}),
    },
    select: { id: true, currencyId: true, remainingAmount: true },
  });
  return {
    rent: rent.map((r) => ({ id: r.id, currencyId: r.currencyId, remaining: r.remainingAmount })),
    bills: bills.map((b) => ({ id: b.id, currencyId: b.currencyId, remaining: b.remainingAmount })),
  };
}

export async function buildSnapshot(db: Db, items: DebtItems): Promise<SnapshotLine[]> {
  const sum = (rows: DebtItem[]) => {
    const m = new Map<string, Prisma.Decimal>();
    for (const r of rows) m.set(r.currencyId, (m.get(r.currencyId) ?? ZERO).add(r.remaining));
    return m;
  };
  const rent = sum(items.rent);
  const bills = sum(items.bills);
  const ids = [...new Set([...rent.keys(), ...bills.keys()])];
  const currencies = ids.length
    ? await db.currency.findMany({ where: { id: { in: ids } }, select: { id: true, code: true } })
    : [];
  const code = (id: string) => currencies.find((c) => c.id === id)?.code ?? null;
  return [
    ...[...rent].map(([currencyId, amount]) => ({
      kind: 'RENT' as const,
      currencyId,
      currencyCode: code(currencyId),
      amount: amount.toString(),
    })),
    ...[...bills].map(([currencyId, amount]) => ({
      kind: 'ELECTRICITY' as const,
      currencyId,
      currencyCode: code(currencyId),
      amount: amount.toString(),
    })),
  ];
}

// چقدر از «همین فاکتورها/بل‌ها» هنوز مانده — باقی‌ماندهٔ زندهٔ آن‌ها (نه عددِ لحظهٔ ثبت).
export async function remainingForIds(
  db: Db,
  p: { rentChargeIds: string[]; electricityBillIds: string[] },
): Promise<DebtItems> {
  const rent = p.rentChargeIds.length
    ? await db.rentCharges.findMany({
        where: { id: { in: p.rentChargeIds }, status: { in: RENT_OPEN }, remainingAmount: { gt: 0 } },
        select: { id: true, currencyId: true, remainingAmount: true },
      })
    : [];
  const bills = p.electricityBillIds.length
    ? await db.electricityBill.findMany({
        where: { id: { in: p.electricityBillIds }, status: { in: ELECTRICITY_OPEN }, remainingAmount: { gt: 0 } },
        select: { id: true, currencyId: true, remainingAmount: true },
      })
    : [];
  return {
    rent: rent.map((r) => ({ id: r.id, currencyId: r.currencyId, remaining: r.remainingAmount })),
    bills: bills.map((b) => ({ id: b.id, currencyId: b.currencyId, remaining: b.remainingAmount })),
  };
}

// ساختِ تعهد. یک مستأجر فقط یک تعهدِ OPEN دارد: تعهدِ بازِ قبلی بسته (CANCELLED) و فاکتورهای هنوز-بازِ آن به
// تعهدِ تازه اضافه می‌شود تا هیچ بدهیِ قدیمی از فهرستِ پیگیری نیفتد. قفلِ مشورتی دو درخواستِ هم‌زمان برای
// یک مستأجر را پشتِ هم می‌گذارد.
export async function createDebtPromise(
  tx: Db,
  p: {
    marketId: string;
    tenantId: string;
    contractId?: string | null;
    source: DebtPromiseSource;
    promisedDate: Date;
    reason: string;
    createdById: string | null;
    items: DebtItems;
  },
) {
  await acquireAdvisoryXactLock(tx, `debt-promise:${p.tenantId}`);

  const previous = await tx.debtPromise.findMany({
    where: { tenantId: p.tenantId, status: DebtPromiseStatus.OPEN },
  });
  const rentIds = new Set(p.items.rent.map((i) => i.id));
  const billIds = new Set(p.items.bills.map((i) => i.id));
  const merged: DebtItems = { rent: [...p.items.rent], bills: [...p.items.bills] };
  for (const old of previous) {
    const still = await remainingForIds(tx, {
      rentChargeIds: old.rentChargeIds,
      electricityBillIds: old.electricityBillIds,
    });
    for (const r of still.rent) {
      if (rentIds.has(r.id)) continue;
      rentIds.add(r.id);
      merged.rent.push(r);
    }
    for (const b of still.bills) {
      if (billIds.has(b.id)) continue;
      billIds.add(b.id);
      merged.bills.push(b);
    }
    await tx.debtPromise.update({
      where: { id: old.id },
      data: {
        status: DebtPromiseStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: 'با تعهدِ پرداختِ تازه جایگزین شد',
      },
    });
  }

  const snapshot = await buildSnapshot(tx, merged);
  const created = await tx.debtPromise.create({
    data: {
      marketId: p.marketId,
      tenantId: p.tenantId,
      contractId: p.contractId ?? null,
      source: p.source,
      status: DebtPromiseStatus.OPEN,
      promisedDate: p.promisedDate,
      reason: p.reason.trim(),
      rentChargeIds: merged.rent.map((i) => i.id),
      electricityBillIds: merged.bills.map((i) => i.id),
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      createdById: p.createdById,
    },
  });
  return { promise: created, supersededIds: previous.map((o) => o.id), snapshot };
}

// بعد از هر تغییرِ بدهیِ یک مستأجر (پرداخت، بخشش، تسویه) صدا زده می‌شود: اگر همهٔ فاکتورها/بل‌های یک
// تعهدِ باز صفر شده باشند، تعهد FULFILLED می‌شود. وقتی تعهدِ بازی نیست فقط یک کوئریِ ایندکس‌دار است.
export async function refreshDebtPromisesForTenant(tx: Db, tenantId: string): Promise<void> {
  const open = await tx.debtPromise.findMany({
    where: { tenantId, status: DebtPromiseStatus.OPEN },
    select: { id: true, rentChargeIds: true, electricityBillIds: true },
  });
  for (const p of open) {
    const rem = await remainingForIds(tx, {
      rentChargeIds: p.rentChargeIds,
      electricityBillIds: p.electricityBillIds,
    });
    if (rem.rent.length === 0 && rem.bills.length === 0) {
      await tx.debtPromise.update({
        where: { id: p.id },
        data: { status: DebtPromiseStatus.FULFILLED, fulfilledAt: new Date() },
      });
    }
  }
}

// نمای یک تعهد برای پاسخ‌ها: باقی‌ماندهٔ زنده (به‌تفکیکِ نوع و ارز) + عقب‌افتاده بودن.
export async function describePromise(
  db: Db,
  p: {
    status: DebtPromiseStatus;
    promisedDate: Date;
    rentChargeIds: string[];
    electricityBillIds: string[];
  },
  now: Date = new Date(),
) {
  const rem = p.status === DebtPromiseStatus.OPEN ? await remainingForIds(db, p) : { rent: [], bills: [] };
  const remainingLines = await buildSnapshot(db, rem);
  const today = kabulDate(now).getTime();
  const isOverdue =
    p.status === DebtPromiseStatus.OPEN && remainingLines.length > 0 && p.promisedDate.getTime() < today;
  const daysOverdue = isOverdue ? Math.round((today - p.promisedDate.getTime()) / 86_400_000) : 0;
  return { remaining: remainingLines, isOverdue, daysOverdue };
}
