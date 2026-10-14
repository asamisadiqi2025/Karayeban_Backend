import { DebtStatus, Prisma } from '@prisma/client';

// منطقِ خالصِ «خلاصهٔ بدهیِ کرایه» (بدون دیتابیس و Nest) تا جداگانه تست شود. RentService.recomputeRentDebt
// فاکتورهای بازِ مستأجر را «به‌تفکیکِ ارز» گروه می‌کند و برای هر ارز summarizeRentDebt را صدا می‌زند —
// کرایه به ارزِ قرارداد است و ارزهای مختلف هرگز در یک عدد جمع نمی‌شوند.

const ZERO = new Prisma.Decimal(0);

export type OpenChargeForDebt = {
  periodStart: Date;
  periodEnd: Date;
  remainingAmount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
};

export type RentDebtSummary<T extends OpenChargeForDebt> = {
  totalDebt: Prisma.Decimal;
  overdueDebt: Prisma.Decimal;
  status: DebtStatus;
  lastCharge: T | undefined;
};

// فاکتورهای باز «یک ارز» → بدهی. تعریف‌ها همان تعریفِ قبلیِ recomputeRentDebt است:
//  - totalDebt: «چقدر تا امروز باید پرداخته می‌شد» — کرایه از «شروعِ» دوره سررسید می‌شود (پیش‌پرداخت)؛
//    فاکتورهای آیندهٔ از قبل تولیدشده (periodStart نرسیده) عمداً کنار گذاشته می‌شوند.
//  - overdueDebt: فاکتورهایی که «پایانِ» دوره‌شان گذشته.
//  - status: شدتِ بدهی = overdueDebt ÷ کرایهٔ ماهانه (netAmount آخرین فاکتورِ باز، نه Contract.rent که بعد از
//    تعدیل نرخِ واقعی نیست).
export function summarizeRentDebt<T extends OpenChargeForDebt>(
  charges: T[],
  now: Date,
): RentDebtSummary<T> {
  const totalDebt = charges
    .filter((c) => c.periodStart <= now)
    .reduce((s, c) => s.add(c.remainingAmount), ZERO);
  const overdueDebt = charges
    .filter((c) => c.periodEnd < now)
    .reduce((s, c) => s.add(c.remainingAmount), ZERO);

  const lastCharge = [...charges].sort(
    (a, b) => b.periodStart.getTime() - a.periodStart.getTime(),
  )[0];
  const monthlyRent = lastCharge?.netAmount ?? null;

  let status: DebtStatus = DebtStatus.CLEAN;
  if (monthlyRent && monthlyRent.greaterThan(0) && overdueDebt.greaterThan(0)) {
    const monthsOverdue = overdueDebt.div(monthlyRent);
    if (monthsOverdue.greaterThan(6)) status = DebtStatus.CRITICAL;
    else if (monthsOverdue.greaterThan(3)) status = DebtStatus.HIGH;
    else if (monthsOverdue.greaterThan(1)) status = DebtStatus.MEDIUM;
    else status = DebtStatus.LOW;
  } else if (overdueDebt.greaterThan(0)) {
    status = DebtStatus.LOW;
  }

  return { totalDebt, overdueDebt, status, lastCharge };
}

// ───────────────────────── نمای خواندنِ بدهیِ یک مستأجر ─────────────────────────

const SEVERITY: Record<DebtStatus, number> = {
  CLEAN: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export type RentDebtRow = {
  totalDebt: Prisma.Decimal;
  overdueDebt: Prisma.Decimal;
  status: DebtStatus;
  currency: { id: string; code: string };
};

// GET /rent/debts/:tenantId. سازگار با نسخهٔ قبل:
//  - مستأجری که فقط در «یک» ارز بدهی دارد (یا هیچ‌کدام): همان شکلِ قبلی (فیلدهای ردیف در سطحِ بالا)،
//    به‌علاوهٔ currency/currencyId و byCurrency.
//  - مستأجری که در «چند» ارز بدهی دارد: totalDebt و overdueDebt = null (جمعِ ارزها بی‌معناست)،
//    isMultiCurrency = true و status = بدترین وضعیتِ بینِ ارزها؛ همهٔ جزئیات در byCurrency.
export function buildRentDebtView<T extends RentDebtRow>(
  tenantId: string,
  rows: T[],
) {
  const byCurrency = [...rows].sort((a, b) =>
    a.currency.code.localeCompare(b.currency.code),
  );
  const withDebt = byCurrency.filter(
    (r) => r.totalDebt.greaterThan(0) || r.overdueDebt.greaterThan(0),
  );

  if (withDebt.length > 1) {
    const worst = withDebt.reduce(
      (w, r) => (SEVERITY[r.status] > SEVERITY[w] ? r.status : w),
      DebtStatus.CLEAN as DebtStatus,
    );
    return {
      tenantId,
      isMultiCurrency: true,
      totalDebt: null,
      overdueDebt: null,
      status: worst,
      byCurrency,
    };
  }

  const primary = withDebt[0] ?? byCurrency[0];
  if (primary) {
    return { ...primary, isMultiCurrency: false, byCurrency };
  }
  // هنوز هیچ ردیفی نیست (مستأجرِ بدونِ فاکتور): همان پیش‌فرضِ قبلی.
  return {
    tenantId,
    isMultiCurrency: false,
    totalDebt: ZERO,
    overdueDebt: ZERO,
    status: DebtStatus.CLEAN,
    byCurrency,
  };
}
