import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaymentListQueryDto } from './dto/payment-list-query.dto';
import {
  buildElectricityPaymentWhere,
  buildRentPaymentWhere,
} from './payments-filters';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const q = (o: Record<string, unknown>) =>
  plainToInstance(PaymentListQueryDto, o);

describe('buildRentPaymentWhere', () => {
  it('adds nothing without filters', () => {
    expect(buildRentPaymentWhere(q({}))).toEqual({});
    expect(
      buildRentPaymentWhere(
        q({ page: '3', limit: '50', sortBy: 'createdAt', type: 'RENT' }),
      ),
    ).toEqual({});
  });

  it('maps direct filters and the floor through the shop', () => {
    expect(
      buildRentPaymentWhere(
        q({
          tenantId: U1,
          shopId: U2,
          contractId: U1,
          accountId: U2,
          currencyId: U1,
          collectedById: U2,
          paymentMethod: 'cash',
          source: 'BANK',
          isOpeningEntry: 'false',
          floorId: U1,
        }),
      ),
    ).toEqual({
      tenantId: U1,
      shopId: U2,
      contractId: U1,
      accountId: U2,
      currencyId: U1,
      collectedById: U2,
      paymentMethod: 'cash',
      source: 'BANK',
      isOpeningEntry: false,
      shop: { floorId: U1 },
    });
  });

  it('cuts the date range at Kabul midnight and supports one-sided ranges', () => {
    expect(
      buildRentPaymentWhere(q({ fromDate: '2026-10-01', toDate: '2026-10-31' }))
        .paymentDate,
    ).toEqual({
      gte: new Date('2026-09-30T19:30:00.000Z'),
      lt: new Date('2026-10-31T19:30:00.000Z'),
    });
    expect(
      buildRentPaymentWhere(q({ fromDate: '2026-10-01' })).paymentDate,
    ).toEqual({ gte: new Date('2026-09-30T19:30:00.000Z') });
    expect(
      buildRentPaymentWhere(q({ toDate: '2026-10-01' })).paymentDate,
    ).toEqual({ lt: new Date('2026-10-01T19:30:00.000Z') });
  });

  it('rejects an inverted range with 400', () => {
    expect(() =>
      buildRentPaymentWhere(
        q({ fromDate: '2026-10-02', toDate: '2026-10-01' }),
      ),
    ).toThrow(BadRequestException);
  });

  it('searches tenant, shop, receipt number and notes', () => {
    const c = { contains: 'R-9', mode: 'insensitive' };
    expect(buildRentPaymentWhere(q({ search: 'R-9' })).AND).toEqual([
      {
        OR: [
          { tenant: { fullName: c } },
          { shop: { shopNumber: c } },
          { receiptNumber: c },
          { notes: c },
        ],
      },
    ]);
  });

  it('never touches marketId', () => {
    expect(
      buildRentPaymentWhere(
        q({ contractId: U1, search: 'a', fromDate: '2026-01-01' }),
      ),
    ).not.toHaveProperty('marketId');
  });
});

describe('buildElectricityPaymentWhere', () => {
  it('adds nothing without filters', () => {
    expect(buildElectricityPaymentWhere(q({}))).toEqual({});
  });

  it('puts tenant/shop directly and the contract through the allocations', () => {
    expect(
      buildElectricityPaymentWhere(
        q({ tenantId: U1, shopId: U2, contractId: U1 }),
      ),
    ).toEqual({
      tenantId: U1,
      shopId: U2,
      allocations: { some: { bill: { contractId: U1 } } },
    });
  });

  it('shares the tested electricity filters (method, source, date, search)', () => {
    const w = buildElectricityPaymentWhere(
      q({
        paymentMethod: 'cheque',
        source: 'SECURITY_DEPOSIT',
        isOpeningEntry: 'true',
        fromDate: '2026-10-01',
        search: 'x',
      }),
    );
    expect(w.paymentMethod).toBe('cheque');
    expect(w.source).toBe('SECURITY_DEPOSIT');
    expect(w.isOpeningEntry).toBe(true);
    expect(w.paymentDate).toEqual({
      gte: new Date('2026-09-30T19:30:00.000Z'),
    });
    expect(w.AND).toHaveLength(1);
    expect(w).not.toHaveProperty('marketId');
  });
});

describe('PaymentListQueryDto validation', () => {
  const errorsOf = async (o: Record<string, unknown>) =>
    (await validate(q(o))).map((e) => e.property);

  it('turns "false" into a real false (not truthy)', () => {
    expect(q({ isOpeningEntry: 'false' }).isOpeningEntry).toBe(false);
    expect(q({ isOpeningEntry: 'true' }).isOpeningEntry).toBe(true);
  });

  it('accepts a full valid query', async () => {
    expect(
      await errorsOf({
        type: 'ELECTRICITY',
        tenantId: U1,
        shopId: U2,
        contractId: U1,
        floorId: U2,
        accountId: U1,
        currencyId: U2,
        collectedById: U1,
        paymentMethod: 'cash',
        source: 'BANK',
        isOpeningEntry: 'false',
        fromDate: '2026-01-01',
        toDate: '2026-12-31',
        search: 'ali',
        page: '2',
        limit: '50',
        sortBy: 'createdAt',
        sortOrder: 'asc',
      }),
    ).toEqual([]);
  });

  it('rejects bad values with the right property name', async () => {
    expect(await errorsOf({ type: 'LOAN' })).toContain('type');
    expect(await errorsOf({ tenantId: 'x' })).toContain('tenantId');
    expect(await errorsOf({ paymentMethod: 'bitcoin' })).toContain(
      'paymentMethod',
    );
    expect(await errorsOf({ source: 'GIFT' })).toContain('source');
    expect(await errorsOf({ fromDate: 'yesterday' })).toContain('fromDate');
    expect(await errorsOf({ isOpeningEntry: 'maybe' })).toContain(
      'isOpeningEntry',
    );
  });
});
