import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ElectricityBillQueryDto } from './dto/electricity-bill-query.dto';
import { ElectricityPaymentQueryDto } from './dto/electricity-payment-query.dto';
import {
  buildBillFilters,
  buildDebtFilters,
  buildPaymentFilters,
} from './electricity-filters';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

const bill = (q: Record<string, unknown>) =>
  plainToInstance(ElectricityBillQueryDto, q);
const pay = (q: Record<string, unknown>) =>
  plainToInstance(ElectricityPaymentQueryDto, q);

describe('buildBillFilters', () => {
  it('adds nothing when no new filter is given (old behavior unchanged)', () => {
    expect(buildBillFilters(bill({}))).toEqual({});
    expect(
      buildBillFilters(
        bill({ shopId: U1, tenantId: U2, status: 'PAID', page: 2 }),
      ),
    ).toEqual({});
  });

  it('maps the simple id / number filters', () => {
    const w = buildBillFilters(
      bill({
        contractId: U1,
        meterId: U2,
        billingCycleId: U1,
        currencyId: U2,
        year: '1405',
        periodNumber: '3',
      }),
    );
    expect(w).toEqual({
      contractId: U1,
      meterId: U2,
      billingCycleId: U1,
      currencyId: U2,
      year: 1405,
      periodNumber: 3,
    });
  });

  it('filters by floor through the bill shop', () => {
    expect(buildBillFilters(bill({ floorId: U1 }))).toEqual({
      shop: { floorId: U1 },
    });
  });

  it('overlaps the bill period with the date range, not just its start', () => {
    const w = buildBillFilters(
      bill({ fromDate: '2026-09-30', toDate: '2026-10-02' }),
    );
    expect(w.AND).toEqual([
      { periodEnd: { gte: new Date('2026-09-30T00:00:00.000Z') } },
      { periodStart: { lt: new Date('2026-10-03T00:00:00.000Z') } },
    ]);
  });

  it('rejects an inverted date range with 400', () => {
    expect(() =>
      buildBillFilters(bill({ fromDate: '2026-10-02', toDate: '2026-10-01' })),
    ).toThrow(BadRequestException);
  });

  it('turns ?search= into an OR over tenant, shop, meter and notes (case-insensitive)', () => {
    const w = buildBillFilters(bill({ search: '  ali ' }));
    const cond = { contains: 'ali', mode: 'insensitive' };
    expect(w.AND).toEqual([
      {
        OR: [
          { tenant: { fullName: cond } },
          { shop: { shopNumber: cond } },
          { meter: { meterNumber: cond } },
          { meter: { serialNumber: cond } },
          { notes: cond },
        ],
      },
    ]);
  });

  it('keeps search and date conditions together without clobbering each other', () => {
    const w = buildBillFilters(bill({ search: 'x', fromDate: '2026-10-01' }));
    expect(w.AND).toHaveLength(2);
  });

  it('never touches marketId, so a filter cannot widen the user market scope', () => {
    const w = buildBillFilters(
      bill({
        contractId: U1,
        floorId: U2,
        search: 'a',
        fromDate: '2026-01-01',
      }),
    );
    expect(w).not.toHaveProperty('marketId');
  });
});

describe('buildPaymentFilters', () => {
  it('adds nothing when no new filter is given (old behavior unchanged)', () => {
    expect(buildPaymentFilters(pay({}))).toEqual({});
    expect(buildPaymentFilters(pay({ shopId: U1, tenantId: U2 }))).toEqual({});
  });

  it('maps the direct payment filters', () => {
    const w = buildPaymentFilters(
      pay({
        accountId: U1,
        currencyId: U2,
        collectedById: U1,
        paymentMethod: 'cash',
        source: 'BANK',
        floorId: U2,
      }),
    );
    expect(w).toEqual({
      accountId: U1,
      currencyId: U2,
      collectedById: U1,
      paymentMethod: 'cash',
      source: 'BANK',
      shop: { floorId: U2 },
    });
  });

  it('applies contract / period / bill conditions to ONE bill via a single allocations.some', () => {
    const w = buildPaymentFilters(
      pay({ contractId: U1, year: '1405', periodNumber: '3', billId: U2 }),
    );
    expect(w).toEqual({
      allocations: {
        some: {
          billId: U2,
          bill: { contractId: U1, year: 1405, periodNumber: 3 },
        },
      },
    });
  });

  it('uses only a billId condition when nothing else about the bill is asked', () => {
    expect(buildPaymentFilters(pay({ billId: U2 }))).toEqual({
      allocations: { some: { billId: U2 } },
    });
  });

  it('cuts the payment date range at Kabul midnight (instants), and supports one-sided ranges', () => {
    const both = buildPaymentFilters(
      pay({ fromDate: '2026-10-01', toDate: '2026-10-31' }),
    );
    expect(both.paymentDate).toEqual({
      gte: new Date('2026-09-30T19:30:00.000Z'),
      lt: new Date('2026-10-31T19:30:00.000Z'),
    });
    expect(
      buildPaymentFilters(pay({ fromDate: '2026-10-01' })).paymentDate,
    ).toEqual({
      gte: new Date('2026-09-30T19:30:00.000Z'),
    });
    expect(
      buildPaymentFilters(pay({ toDate: '2026-10-01' })).paymentDate,
    ).toEqual({
      lt: new Date('2026-10-01T19:30:00.000Z'),
    });
  });

  it('searches tenant, shop, receipt number and notes', () => {
    const w = buildPaymentFilters(pay({ search: 'R-7' }));
    const cond = { contains: 'R-7', mode: 'insensitive' };
    expect(w.AND).toEqual([
      {
        OR: [
          { tenant: { fullName: cond } },
          { shop: { shopNumber: cond } },
          { receiptNumber: cond },
          { notes: cond },
        ],
      },
    ]);
  });

  it('never touches marketId', () => {
    expect(
      buildPaymentFilters(pay({ contractId: U1, search: 'a' })),
    ).not.toHaveProperty('marketId');
  });
});

describe('buildDebtFilters', () => {
  it('is empty without a search term, so the old list is unchanged', () => {
    expect(buildDebtFilters({})).toEqual({});
    expect(buildDebtFilters({ search: '   ' })).toEqual({});
  });

  it('searches the tenant name, father name and phone', () => {
    const cond = { contains: 'ali', mode: 'insensitive' };
    expect(buildDebtFilters({ search: 'ali' })).toEqual({
      AND: [
        {
          OR: [
            { tenant: { fullName: cond } },
            { tenant: { fatherName: cond } },
            { tenant: { contact: cond } },
          ],
        },
      ],
    });
  });
});

describe('query DTO validation (what the ValidationPipe would do)', () => {
  const errorsOf = async (cls: new () => object, q: Record<string, unknown>) =>
    (await validate(plainToInstance(cls, q))).map((e) => e.property);

  it('turns the query strings "true"/"false" into real booleans (false must NOT become true)', () => {
    expect(bill({ isOpeningEntry: 'false' }).isOpeningEntry).toBe(false);
    expect(bill({ isOpeningEntry: 'true' }).isOpeningEntry).toBe(true);
    expect(bill({ isManualAmount: 'false' }).isManualAmount).toBe(false);
    expect(pay({ isOpeningEntry: 'false' }).isOpeningEntry).toBe(false);
  });

  it('rejects bad values with a clear property name', async () => {
    expect(
      await errorsOf(ElectricityBillQueryDto, { contractId: 'not-a-uuid' }),
    ).toContain('contractId');
    expect(
      await errorsOf(ElectricityBillQueryDto, { periodNumber: '13' }),
    ).toContain('periodNumber');
    expect(
      await errorsOf(ElectricityBillQueryDto, { periodNumber: '0' }),
    ).toContain('periodNumber');
    expect(await errorsOf(ElectricityBillQueryDto, { year: 'abc' })).toContain(
      'year',
    );
    expect(
      await errorsOf(ElectricityBillQueryDto, { isOpeningEntry: 'maybe' }),
    ).toContain('isOpeningEntry');
    expect(
      await errorsOf(ElectricityBillQueryDto, { fromDate: 'yesterday' }),
    ).toContain('fromDate');
    expect(
      await errorsOf(ElectricityPaymentQueryDto, { paymentMethod: 'bitcoin' }),
    ).toContain('paymentMethod');
    expect(
      await errorsOf(ElectricityPaymentQueryDto, { source: 'GIFT' }),
    ).toContain('source');
  });

  it('accepts a full valid query', async () => {
    const errors = await errorsOf(ElectricityBillQueryDto, {
      shopId: U1,
      tenantId: U2,
      status: 'PAID',
      contractId: U1,
      meterId: U2,
      billingCycleId: U1,
      floorId: U2,
      currencyId: U1,
      year: '1405',
      periodNumber: '3',
      isOpeningEntry: 'false',
      isManualAmount: 'true',
      fromDate: '2026-01-01',
      toDate: '2026-12-31',
      search: 'ali',
      page: '2',
      limit: '50',
    });
    expect(errors).toEqual([]);
  });

  it('keeps the old query shapes valid', async () => {
    expect(
      await errorsOf(ElectricityBillQueryDto, {
        shopId: U1,
        status: 'PENDING',
      }),
    ).toEqual([]);
    expect(
      await errorsOf(ElectricityPaymentQueryDto, { tenantId: U1 }),
    ).toEqual([]);
  });
});
