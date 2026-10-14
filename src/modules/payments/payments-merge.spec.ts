import { Prisma } from '@prisma/client';
import {
  comparePayments,
  electricityToUnified,
  mergeCurrencySummary,
  mergePaymentPage,
  rentToUnified,
  resolvePaymentSortField,
  UnifiedPayment,
} from './payments-merge';

const D = (v: number | string) => new Prisma.Decimal(v);

function row(over: Partial<UnifiedPayment> & { id: string }): UnifiedPayment {
  return {
    type: 'RENT',
    paymentDate: new Date('2026-10-01T00:00:00Z'),
    createdAt: new Date('2026-10-01T00:00:00Z'),
    amount: D(1),
    currency: { id: 'afn', code: 'AFN' },
    paymentMethod: 'cash',
    source: 'BANK',
    isOpeningEntry: false,
    receiptNumber: null,
    notes: null,
    exchangeRate: null,
    baseCurrencyAmount: null,
    tenant: { id: 't', fullName: 'T' },
    shop: { id: 's', shopNumber: '1' },
    contractId: null,
    account: null,
    collectedBy: null,
    allocationsCount: 0,
    ...over,
  };
}

describe('resolvePaymentSortField', () => {
  it('accepts only whitelisted fields and falls back to paymentDate', () => {
    expect(resolvePaymentSortField('createdAt')).toBe('createdAt');
    expect(resolvePaymentSortField('paymentDate')).toBe('paymentDate');
    expect(resolvePaymentSortField('amount')).toBe('paymentDate'); // amounts of different currencies are not comparable
    expect(resolvePaymentSortField('passwordHash')).toBe('paymentDate');
    expect(resolvePaymentSortField(undefined)).toBe('paymentDate');
  });
});

describe('comparePayments', () => {
  it('orders by the sort field, then by id (fully deterministic)', () => {
    const a = row({ id: 'a', paymentDate: new Date('2026-01-01') });
    const b = row({ id: 'b', paymentDate: new Date('2026-01-02') });
    expect(comparePayments(a, b, 'paymentDate', 'asc')).toBeLessThan(0);
    expect(comparePayments(a, b, 'paymentDate', 'desc')).toBeGreaterThan(0);
    const same1 = row({ id: 'a' });
    const same2 = row({ id: 'b' });
    expect(comparePayments(same1, same2, 'paymentDate', 'asc')).toBeLessThan(0);
    expect(
      comparePayments(same1, same2, 'paymentDate', 'desc'),
    ).toBeGreaterThan(0);
    expect(comparePayments(same1, same1, 'paymentDate', 'asc')).toBe(0);
  });
});

describe('mergePaymentPage', () => {
  it('interleaves the two lists by date and slices the requested page', () => {
    const rent = [
      row({ id: 'r3', type: 'RENT', paymentDate: new Date('2026-03-01') }),
      row({ id: 'r1', type: 'RENT', paymentDate: new Date('2026-01-01') }),
    ];
    const elec = [
      row({
        id: 'e2',
        type: 'ELECTRICITY',
        paymentDate: new Date('2026-02-01'),
      }),
      row({
        id: 'e4',
        type: 'ELECTRICITY',
        paymentDate: new Date('2026-04-01'),
      }),
    ];
    const page1 = mergePaymentPage([rent, elec], 'paymentDate', 'desc', 0, 3);
    expect(page1.map((p) => p.id)).toEqual(['e4', 'r3', 'e2']);
    const page2 = mergePaymentPage([rent, elec], 'paymentDate', 'desc', 3, 3);
    expect(page2.map((p) => p.id)).toEqual(['r1']);
  });

  it('does not mutate its inputs', () => {
    const rent = [row({ id: 'b' }), row({ id: 'a' })];
    const copy = [...rent];
    mergePaymentPage([rent, []], 'paymentDate', 'asc', 0, 10);
    expect(rent).toEqual(copy);
  });

  // The core guarantee of the "window merge" strategy used by the service: if each table returns its
  // first (skip+limit) rows in the global order, merging + slicing is EXACTLY the right page of the
  // union. Verified against a brute-force full sort on many random inputs, including many ties.
  it('equals a brute-force full sort + slice for hundreds of random cases (with tied dates)', () => {
    let seed = 12345;
    const rnd = () =>
      (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const makeList = (
      type: 'RENT' | 'ELECTRICITY',
      n: number,
    ): UnifiedPayment[] =>
      Array.from({ length: n }, (_, i) =>
        row({
          id: `${type[0]}-${String(Math.floor(rnd() * 1e6)).padStart(7, '0')}-${i}`,
          type,
          // few distinct dates -> lots of ties, exercising the id tie-breaker
          paymentDate: new Date(2026, 0, 1 + Math.floor(rnd() * 6)),
          createdAt: new Date(2026, 0, 1 + Math.floor(rnd() * 6)),
        }),
      );

    for (let iter = 0; iter < 300; iter++) {
      const rent = makeList('RENT', Math.floor(rnd() * 40));
      const elec = makeList('ELECTRICITY', Math.floor(rnd() * 40));
      const field = rnd() < 0.5 ? 'paymentDate' : 'createdAt';
      const dir = rnd() < 0.5 ? 'asc' : 'desc';
      const limit = 1 + Math.floor(rnd() * 15);
      const skip = Math.floor(rnd() * 50);

      const expected = [...rent, ...elec]
        .sort((a, b) => comparePayments(a, b, field, dir))
        .slice(skip, skip + limit)
        .map((p) => p.id);

      // what the DB would hand the service: each table sorted, truncated to (skip+limit)
      const window = (list: UnifiedPayment[]) =>
        [...list]
          .sort((a, b) => comparePayments(a, b, field, dir))
          .slice(0, skip + limit);
      const actual = mergePaymentPage(
        [window(rent), window(elec)],
        field,
        dir,
        skip,
        limit,
      ).map((p) => p.id);

      expect(actual).toEqual(expected);
    }
  });
});

describe('mergeCurrencySummary', () => {
  it('sums per currency across both tables and never mixes currencies', () => {
    const codes = new Map([
      ['afn', 'AFN'],
      ['usd', 'USD'],
    ]);
    const out = mergeCurrencySummary(
      [
        [
          { currencyId: 'afn', amount: D(100), count: 2 },
          { currencyId: 'usd', amount: D(5), count: 1 },
        ],
        [{ currencyId: 'afn', amount: D('50.5'), count: 3 }],
      ],
      codes,
    );
    expect(
      out.map((o) => [o.currencyCode, o.totalAmount.toString(), o.count]),
    ).toEqual([
      ['AFN', '150.5', 5],
      ['USD', '5', 1],
    ]);
  });

  it('handles null sums and empty input', () => {
    expect(mergeCurrencySummary([[], []], new Map())).toEqual([]);
    const out = mergeCurrencySummary(
      [[{ currencyId: 'x', amount: null, count: 0 }]],
      new Map(),
    );
    expect(out[0].totalAmount.toString()).toBe('0');
    expect(out[0].currencyCode).toBeNull();
  });

  it('has no float drift', () => {
    const out = mergeCurrencySummary(
      [
        [{ currencyId: 'a', amount: D('0.1'), count: 1 }],
        [{ currencyId: 'a', amount: D('0.2'), count: 1 }],
      ],
      new Map(),
    );
    expect(out[0].totalAmount.toString()).toBe('0.3');
  });
});

describe('row mapping', () => {
  const base = {
    id: 'p1',
    paymentDate: new Date('2026-10-01T10:00:00Z'),
    createdAt: new Date('2026-10-01T10:00:01Z'),
    amount: D(500),
    currency: { id: 'afn', code: 'AFN' },
    paymentMethod: 'cash',
    source: 'BANK',
    isOpeningEntry: false,
    receiptNumber: 'R-1',
    notes: null,
    exchangeRate: null,
    baseCurrencyAmount: null,
    tenant: { id: 't', fullName: 'Ali' },
    shop: { id: 's', shopNumber: '12' },
    account: { id: 'a', name: 'Cash' },
    collectedBy: { id: 'u', fullName: 'Acc' },
    _count: { allocations: 2 },
  };

  it('tags the type, keeps the contract only for rent and exposes the allocation count', () => {
    const rent = rentToUnified({ ...base, contractId: 'c1' });
    expect(rent.type).toBe('RENT');
    expect(rent.contractId).toBe('c1');
    expect(rent.allocationsCount).toBe(2);
    const elec = electricityToUnified(base);
    expect(elec.type).toBe('ELECTRICITY');
    expect(elec.contractId).toBeNull();
  });

  it('never carries internal fields (only the whitelisted list shape)', () => {
    const keys = Object.keys(
      rentToUnified({ ...base, contractId: 'c1' }),
    ).sort();
    expect(keys).toEqual(
      [
        'account',
        'allocationsCount',
        'amount',
        'baseCurrencyAmount',
        'collectedBy',
        'contractId',
        'createdAt',
        'currency',
        'exchangeRate',
        'id',
        'isOpeningEntry',
        'notes',
        'paymentDate',
        'paymentMethod',
        'receiptNumber',
        'shop',
        'source',
        'tenant',
        'type',
      ].sort(),
    );
  });
});
