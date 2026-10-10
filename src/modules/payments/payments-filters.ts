import { Prisma } from '@prisma/client';
import { buildSearchWhere } from '../../common/utils/pagination';
import { resolveOptionalDayRange } from '../../common/utils/day-range';
import { buildPaymentFilters } from '../electricity/electricity-filters';
import type { PaymentListQueryDto } from './dto/payment-list-query.dto';

// شرط‌های فهرستِ یکپارچه، به‌صورتِ توابعِ خالص (بدون دیتابیس) تا جداگانه تست شوند. «دامنهٔ بازار»
// (marketId) را سرویس خودش اضافه می‌کند و این توابع هرگز آن را لمس نمی‌کنند.

export const RENT_PAYMENT_SEARCH_FIELDS = [
  'tenant.fullName',
  'shop.shopNumber',
  'receiptNumber',
  'notes',
] as const;

export function buildRentPaymentWhere(
  q: PaymentListQueryDto,
): Prisma.RentPaymentWhereInput {
  const where: Prisma.RentPaymentWhereInput = {};
  const and: Prisma.RentPaymentWhereInput[] = [];

  if (q.tenantId !== undefined) where.tenantId = q.tenantId;
  if (q.shopId !== undefined) where.shopId = q.shopId;
  if (q.contractId !== undefined) where.contractId = q.contractId;
  if (q.accountId !== undefined) where.accountId = q.accountId;
  if (q.currencyId !== undefined) where.currencyId = q.currencyId;
  if (q.collectedById !== undefined) where.collectedById = q.collectedById;
  if (q.paymentMethod !== undefined) where.paymentMethod = q.paymentMethod;
  if (q.source !== undefined) where.source = q.source;
  if (q.isOpeningEntry !== undefined) where.isOpeningEntry = q.isOpeningEntry;
  if (q.floorId !== undefined) where.shop = { floorId: q.floorId };

  // paymentDate «لحظه» است → مرزِ روز نیمه‌شبِ کابل (نه UTC).
  const range = resolveOptionalDayRange(q.fromDate, q.toDate);
  if (range.fromInstant || range.toInstantExclusive) {
    where.paymentDate = {
      ...(range.fromInstant ? { gte: range.fromInstant } : {}),
      ...(range.toInstantExclusive ? { lt: range.toInstantExclusive } : {}),
    };
  }

  const search = buildSearchWhere(RENT_PAYMENT_SEARCH_FIELDS, q.search);
  if (search) and.push(search);
  if (and.length > 0) where.AND = and;
  return where;
}

// برق: همان سازندهٔ تست‌شدهٔ فهرستِ برق (electricity-filters) — تنها فرق این است که tenantId/shopId
// در آن‌جا توسط خودِ سرویسِ برق گذاشته می‌شد و این‌جا باید اضافه شود.
export function buildElectricityPaymentWhere(
  q: PaymentListQueryDto,
): Prisma.ElectricityPaymentWhereInput {
  const where: Prisma.ElectricityPaymentWhereInput = {};
  if (q.tenantId !== undefined) where.tenantId = q.tenantId;
  if (q.shopId !== undefined) where.shopId = q.shopId;
  return Object.assign(where, buildPaymentFilters(q));
}
