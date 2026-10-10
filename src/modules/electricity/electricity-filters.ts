import { Prisma } from '@prisma/client';
import { buildSearchWhere } from '../../common/utils/pagination';
import { resolveOptionalDayRange } from '../../common/utils/day-range';
import type { ElectricityBillQueryDto } from './dto/electricity-bill-query.dto';
import type { ElectricityPaymentQueryDto } from './dto/electricity-payment-query.dto';

// فیلترهای لیست‌های برق، به‌صورتِ توابعِ خالصی که فقط «شرطِ اضافی» می‌سازند (بدون دیتابیس و Nest)
// تا جداگانه تست شوند. سرویس شرطِ پایه (marketId و فیلترهای قدیمی shopId/tenantId/status) را خودش
// می‌سازد و این‌ها را روی آن Object.assign می‌کند؛ هیچ‌کدام کلیدِ marketId را لمس نمی‌کنند، پس
// دامنهٔ دسترسیِ کاربر (فقط بازارِ خودش) هرگز با یک فیلتر دور زده نمی‌شود.

// جست‌وجوی متنی (?search=) روی فیلدهای سفیدلیست‌شده؛ رابطه‌های to-one با نقطه (همان قراردادِ buildSearchWhere).
export const BILL_SEARCH_FIELDS = [
  'tenant.fullName',
  'shop.shopNumber',
  'meter.meterNumber',
  'meter.serialNumber',
  'notes',
] as const;
export const PAYMENT_SEARCH_FIELDS = [
  'tenant.fullName',
  'shop.shopNumber',
  'receiptNumber',
  'notes',
] as const;
export const DEBT_SEARCH_FIELDS = [
  'tenant.fullName',
  'tenant.fatherName',
  'tenant.contact',
] as const;

export function buildBillFilters(
  q: ElectricityBillQueryDto,
): Prisma.ElectricityBillWhereInput {
  const where: Prisma.ElectricityBillWhereInput = {};
  const and: Prisma.ElectricityBillWhereInput[] = [];

  if (q.contractId !== undefined) where.contractId = q.contractId;
  if (q.meterId !== undefined) where.meterId = q.meterId;
  if (q.billingCycleId !== undefined) where.billingCycleId = q.billingCycleId;
  if (q.currencyId !== undefined) where.currencyId = q.currencyId;
  if (q.year !== undefined) where.year = q.year;
  if (q.periodNumber !== undefined) where.periodNumber = q.periodNumber;
  if (q.isOpeningEntry !== undefined) where.isOpeningEntry = q.isOpeningEntry;
  if (q.isManualAmount !== undefined) where.isManualAmount = q.isManualAmount;
  // طبقه روی خودِ بل ستون ندارد؛ از دوکانِ بل خوانده می‌شود.
  if (q.floorId !== undefined) where.shop = { floorId: q.floorId };

  // بازه: بل‌هایی که «دورهٔ» آن‌ها با [fromDate, toDate] همپوشانی دارد (نه فقط شروعشان داخل بازه باشد).
  const range = resolveOptionalDayRange(q.fromDate, q.toDate);
  if (range.fromCalendar) and.push({ periodEnd: { gte: range.fromCalendar } });
  if (range.toCalendarExclusive)
    and.push({ periodStart: { lt: range.toCalendarExclusive } });

  const search = buildSearchWhere(BILL_SEARCH_FIELDS, q.search);
  if (search) and.push(search);

  if (and.length > 0) where.AND = and;
  return where;
}

// Partial: فهرستِ یکپارچهٔ پرداخت‌ها (modules/payments) هم از همین سازنده استفاده می‌کند.
export function buildPaymentFilters(
  q: Partial<ElectricityPaymentQueryDto>,
): Prisma.ElectricityPaymentWhereInput {
  const where: Prisma.ElectricityPaymentWhereInput = {};
  const and: Prisma.ElectricityPaymentWhereInput[] = [];

  if (q.accountId !== undefined) where.accountId = q.accountId;
  if (q.currencyId !== undefined) where.currencyId = q.currencyId;
  if (q.collectedById !== undefined) where.collectedById = q.collectedById;
  if (q.paymentMethod !== undefined) where.paymentMethod = q.paymentMethod;
  if (q.source !== undefined) where.source = q.source;
  if (q.isOpeningEntry !== undefined) where.isOpeningEntry = q.isOpeningEntry;
  if (q.floorId !== undefined) where.shop = { floorId: q.floorId };

  // پرداخت مستقیماً به قرارداد/دوره وصل نیست؛ از راهِ تخصیص‌هایش (allocations → بل) وصل است. همهٔ
  // شرط‌های سطحِ بل در «یک» some می‌آیند تا روی «همان یک بل» اعمال شوند، نه هرکدام روی بلِ جدا.
  const allocation: Prisma.ElectricityPaymentAllocationWhereInput = {};
  const bill: Prisma.ElectricityBillWhereInput = {};
  if (q.billId !== undefined) allocation.billId = q.billId;
  if (q.contractId !== undefined) bill.contractId = q.contractId;
  if (q.year !== undefined) bill.year = q.year;
  if (q.periodNumber !== undefined) bill.periodNumber = q.periodNumber;
  if (Object.keys(bill).length > 0) allocation.bill = bill;
  if (Object.keys(allocation).length > 0)
    where.allocations = { some: allocation };

  // paymentDate «لحظه» است → مرزِ روز نیمه‌شبِ کابل (نه UTC).
  const range = resolveOptionalDayRange(q.fromDate, q.toDate);
  if (range.fromInstant || range.toInstantExclusive) {
    where.paymentDate = {
      ...(range.fromInstant ? { gte: range.fromInstant } : {}),
      ...(range.toInstantExclusive ? { lt: range.toInstantExclusive } : {}),
    };
  }

  const search = buildSearchWhere(PAYMENT_SEARCH_FIELDS, q.search);
  if (search) and.push(search);

  if (and.length > 0) where.AND = and;
  return where;
}

export function buildDebtFilters(q: {
  search?: string;
}): Prisma.ElectricityDebtWhereInput {
  const search = buildSearchWhere(DEBT_SEARCH_FIELDS, q.search);
  return search ? { AND: [search] } : {};
}
