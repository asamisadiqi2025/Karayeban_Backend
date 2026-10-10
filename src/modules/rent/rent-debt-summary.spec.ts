import { DebtStatus, Prisma } from '@prisma/client';
import {
  buildRentDebtView,
  RentDebtRow,
  summarizeRentDebt,
} from './rent-debt-summary';

const D = (v: number | string) => new Prisma.Decimal(v);
const NOW = new Date('2026-10-10T00:00:00.000Z');
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

const charge = (start: string, end: string, remaining: number, net = 1000) => ({
  periodStart: day(start),
  periodEnd: day(end),
  remainingAmount: D(remaining),
  netAmount: D(net),
});

describe('summarizeRentDebt (one currency)', () => {
  it('counts only charges whose period has STARTED as debt (future pre-generated charges are not debt)', () => {
    const s = summarizeRentDebt(
      [
        charge('2026-09-01', '2026-10-01', 1000),
        charge('2026-10-01', '2026-11-01', 1000),
        charge('2026-11-01', '2026-12-01', 1000),
      ],
      NOW,
    );
    expect(s.totalDebt.toString()).toBe('2000'); // Sep + Oct started, Nov did not
  });

  it('counts as OVERDUE only charges whose period has ENDED', () => {
    const s = summarizeRentDebt(
      [
        charge('2026-09-01', '2026-10-01', 1000),
        charge('2026-10-01', '2026-11-01', 1000),
      ],
      NOW,
    );
    expect(s.overdueDebt.toString()).toBe('1000');
  });

  it('derives the status from overdue months using the LAST open charge as the monthly rent', () => {
    const mk = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        charge(`2026-0${i + 1}-01`, `2026-0${i + 2}-01`, 1000, 1000),
      );
    // months 1..n all ended before 2026-10-10 for n <= 8
    expect(summarizeRentDebt(mk(1), NOW).status).toBe(DebtStatus.LOW); // 1 month
    expect(summarizeRentDebt(mk(2), NOW).status).toBe(DebtStatus.MEDIUM); // 2 months  (> 1)
    expect(summarizeRentDebt(mk(4), NOW).status).toBe(DebtStatus.HIGH); // 4 months   (> 3)
    expect(summarizeRentDebt(mk(7), NOW).status).toBe(DebtStatus.CRITICAL); // 7 months   (> 6)
  });

  it('is CLEAN when nothing is overdue, and LOW when overdue but the monthly rent is unknown/zero', () => {
    expect(
      summarizeRentDebt([charge('2026-10-01', '2026-11-01', 1000)], NOW).status,
    ).toBe(DebtStatus.CLEAN);
    expect(summarizeRentDebt([], NOW).status).toBe(DebtStatus.CLEAN);
    expect(
      summarizeRentDebt([charge('2026-08-01', '2026-09-01', 500, 0)], NOW)
        .status,
    ).toBe(DebtStatus.LOW);
  });

  it('returns the latest charge (by period start) and does not mutate its input', () => {
    const input = [
      charge('2026-08-01', '2026-09-01', 1),
      charge('2026-10-01', '2026-11-01', 2),
      charge('2026-09-01', '2026-10-01', 3),
    ];
    const copy = [...input];
    const s = summarizeRentDebt(input, NOW);
    expect(s.lastCharge?.periodStart.toISOString().slice(0, 10)).toBe(
      '2026-10-01',
    );
    expect(input).toEqual(copy);
  });

  it('has no float drift', () => {
    const s = summarizeRentDebt(
      [
        { ...charge('2026-08-01', '2026-09-01', 0), remainingAmount: D('0.1') },
        { ...charge('2026-09-01', '2026-10-01', 0), remainingAmount: D('0.2') },
      ],
      NOW,
    );
    expect(s.totalDebt.toString()).toBe('0.3');
  });
});

const row = (
  code: string,
  total: number,
  overdue: number,
  status: DebtStatus,
): RentDebtRow & { id: string } => ({
  id: code,
  totalDebt: D(total),
  overdueDebt: D(overdue),
  status,
  currency: { id: `cur-${code}`, code },
});

describe('buildRentDebtView', () => {
  it('keeps the OLD shape for a tenant with one currency (fields at the top level) and adds byCurrency', () => {
    const afn = row('AFN', 5000, 2000, DebtStatus.MEDIUM);
    const v = buildRentDebtView('t1', [afn]);
    expect(v).toMatchObject({
      id: 'AFN',
      isMultiCurrency: false,
      status: DebtStatus.MEDIUM,
    });
    expect(String(v.totalDebt)).toBe('5000');
    expect(String(v.overdueDebt)).toBe('2000');
    expect(v.byCurrency).toHaveLength(1);
  });

  it('never sums currencies: a tenant owing in two currencies gets null totals and the WORST status', () => {
    const v = buildRentDebtView('t1', [
      row('USD', 100, 0, DebtStatus.CLEAN),
      row('AFN', 7000, 7000, DebtStatus.CRITICAL),
    ]);
    expect(v.isMultiCurrency).toBe(true);
    expect(v.totalDebt).toBeNull();
    expect(v.overdueDebt).toBeNull();
    expect(v.status).toBe(DebtStatus.CRITICAL);
    expect(v.byCurrency.map((r) => r.currency.code)).toEqual(['AFN', 'USD']); // sorted by code
  });

  it('treats a currency whose debt was fully paid (zero row) as NOT multi-currency', () => {
    const v = buildRentDebtView('t1', [
      row('USD', 0, 0, DebtStatus.CLEAN),
      row('AFN', 3000, 0, DebtStatus.LOW),
    ]);
    expect(v.isMultiCurrency).toBe(false);
    expect(String((v as { totalDebt: Prisma.Decimal }).totalDebt)).toBe('3000'); // the legacy fields mirror the AFN row
    expect((v as { currency: { code: string } }).currency.code).toBe('AFN');
    expect(v.byCurrency).toHaveLength(2); // but both rows are still listed
  });

  it('returns the old zero default for a tenant with no rows at all', () => {
    const v = buildRentDebtView('t9', []);
    expect(v).toMatchObject({
      tenantId: 't9',
      isMultiCurrency: false,
      status: DebtStatus.CLEAN,
    });
    expect(String(v.totalDebt)).toBe('0');
    expect(v.byCurrency).toEqual([]);
  });

  it('when everything is paid in every currency it still returns a zero legacy row (not multi)', () => {
    const v = buildRentDebtView('t1', [
      row('AFN', 0, 0, DebtStatus.CLEAN),
      row('USD', 0, 0, DebtStatus.CLEAN),
    ]);
    expect(v.isMultiCurrency).toBe(false);
    expect(String(v.totalDebt)).toBe('0');
  });
});
