import { Prisma } from '@prisma/client';
import {
  buildCurrencyStatements,
  combineOpeningBalances,
  electricityBillEvent,
  electricityPaymentEvent,
  kabulDayOf,
  legacyTopLevel,
  rentChargeEvent,
  rentPaymentEvent,
  resolveStatementRange,
} from './tenant-statement.builder';

const D = (v: number | string) => new Prisma.Decimal(v);
const shop = { shopNumber: 'A-12' };
const AFN = 'cur-afn';
const USD = 'cur-usd';
const codes = new Map([
  [AFN, 'AFN'],
  [USD, 'USD'],
]);

const charge = (
  id: string,
  start: string,
  net: number,
  currencyId = AFN,
  gross = net,
) =>
  rentChargeEvent({
    id,
    contractId: 'c1',
    periodStart: new Date(`${start}T00:00:00.000Z`),
    periodEnd: new Date(`${start}T00:00:00.000Z`),
    grossAmount: D(gross),
    netAmount: D(net),
    currencyId,
    shop,
  });
const payment = (id: string, at: string, amount: number, currencyId = AFN) =>
  rentPaymentEvent({
    id,
    contractId: 'c1',
    paymentDate: new Date(at),
    amount: D(amount),
    currencyId,
    receiptNumber: null,
    source: 'BANK',
    isOpeningEntry: false,
    shop,
  });

describe('resolveStatementRange', () => {
  it('uses UTC midnight for calendar dates and Kabul midnight for payment instants', () => {
    const r = resolveStatementRange('2026-10-01', '2026-10-31');
    if (!('range' in r)) throw new Error('expected a range');
    expect(r.range.fromCalendar.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(r.range.toCalendarExclusive.toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
    // 00:00 Kabul (UTC+04:30) = 19:30 UTC of the previous day
    expect(r.range.fromInstant.toISOString()).toBe('2026-09-30T19:30:00.000Z');
    expect(r.range.toInstantExclusive.toISOString()).toBe(
      '2026-10-31T19:30:00.000Z',
    );
  });

  it('reads only the date part when a time is sent, and includes the whole end day', () => {
    const r = resolveStatementRange(
      '2026-10-01T10:00:00.000Z',
      '2026-10-01T23:59:59.000Z',
    );
    if (!('range' in r)) throw new Error('expected a range');
    expect(r.range.fromDay).toBe('2026-10-01');
    expect(
      r.range.toCalendarExclusive.getTime() - r.range.fromCalendar.getTime(),
    ).toBe(24 * 60 * 60_000);
  });

  it('rejects an end before the start and invalid dates', () => {
    expect(resolveStatementRange('2026-10-02', '2026-10-01')).toEqual({
      error: 'END_BEFORE_START',
    });
    expect(resolveStatementRange('not-a-date', '2026-10-01')).toEqual({
      error: 'INVALID_DATE',
    });
  });
});

describe('Kabul day of a payment', () => {
  it('a payment at 01:00 Kabul belongs to that Kabul day, not the previous UTC day', () => {
    expect(kabulDayOf(new Date('2026-09-30T20:30:00.000Z'))).toBe('2026-10-01');
    expect(kabulDayOf(new Date('2026-10-01T19:00:00.000Z'))).toBe('2026-10-01');
    expect(kabulDayOf(new Date('2026-10-01T19:30:00.000Z'))).toBe('2026-10-02');
  });
});

describe('buildCurrencyStatements', () => {
  it('computes running balance, totals and closing = opening + charged - paid', () => {
    const [s] = buildCurrencyStatements({
      events: [
        charge('a', '2026-10-01', 5000),
        payment('b', '2026-10-05T08:00:00.000Z', 2000),
        charge('c', '2026-11-01', 5000),
      ],
      openingBalances: new Map([[AFN, D(1000)]]),
      currencyCodes: codes,
    });
    expect(s.transactions.map((t) => t.balance.toString())).toEqual([
      '6000',
      '4000',
      '9000',
    ]);
    expect(s.openingBalance.toString()).toBe('1000');
    expect(s.closingBalance.toString()).toBe('9000');
    expect(s.totalCharged.toString()).toBe('10000');
    expect(s.totalPaid.toString()).toBe('2000');
    expect(
      s.closingBalance.equals(
        s.openingBalance.add(s.totalCharged).sub(s.totalPaid),
      ),
    ).toBe(true);
    expect(s.closingBalanceSide).toBe('DEBIT');
  });

  it('puts the charge before a payment made on the same Kabul day (no false credit)', () => {
    // Payment at 00:30 Kabul on 1 Oct = 20:00Z on 30 Sep; the charge is dated 1 Oct (UTC midnight).
    const [s] = buildCurrencyStatements({
      events: [
        payment('pay', '2026-09-30T20:00:00.000Z', 5000),
        charge('chg', '2026-10-01', 5000),
      ],
      openingBalances: new Map(),
      currencyCodes: codes,
    });
    expect(s.transactions.map((t) => t.type)).toEqual([
      'RENT_CHARGE',
      'RENT_PAYMENT',
    ]);
    expect(s.transactions.map((t) => t.balance.toString())).toEqual([
      '5000',
      '0',
    ]);
    expect(s.closingBalanceSide).toBe('SETTLED');
  });

  it('orders deterministically when everything ties', () => {
    const run = (ids: string[]) =>
      buildCurrencyStatements({
        events: ids.map((id) => charge(id, '2026-10-01', 100)),
        openingBalances: new Map(),
        currencyCodes: codes,
      })[0].transactions.map((t) => t.id);
    expect(run(['b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
    expect(run(['c', 'b', 'a'])).toEqual(['a', 'b', 'c']);
  });

  it('never mixes currencies: one independent statement per currency', () => {
    const statements = buildCurrencyStatements({
      events: [
        charge('r1', '2026-10-01', 5000, AFN),
        charge('r2', '2026-10-01', 100, USD),
        payment('p1', '2026-10-05T08:00:00.000Z', 40, USD),
      ],
      openingBalances: new Map([[USD, D(10)]]),
      currencyCodes: codes,
    });
    expect(statements.map((s) => s.currencyCode)).toEqual(['AFN', 'USD']);
    const [afn, usd] = statements;
    expect(afn.closingBalance.toString()).toBe('5000');
    expect(usd.openingBalance.toString()).toBe('10');
    expect(usd.closingBalance.toString()).toBe('70'); // 10 + 100 - 40
  });

  it('shows prepayment as a credit (negative balance) when payments exceed charges', () => {
    const [s] = buildCurrencyStatements({
      events: [payment('p', '2026-10-05T08:00:00.000Z', 3000)],
      openingBalances: new Map([[AFN, D(1000)]]),
      currencyCodes: codes,
    });
    expect(s.closingBalance.toString()).toBe('-2000');
    expect(s.closingBalanceSide).toBe('CREDIT');
  });

  it('exposes discounts on the charge row without changing the balance', () => {
    const [s] = buildCurrencyStatements({
      events: [
        charge('a', '2026-10-01', 4000, AFN, 5000),
        charge('b', '2026-11-01', 5500, AFN, 5000),
      ],
      openingBalances: new Map(),
      currencyCodes: codes,
    });
    const [a, b] = s.transactions;
    expect(a.grossAmount?.toString()).toBe('5000');
    expect(a.discountAmount?.toString()).toBe('1000'); // discount
    expect(b.discountAmount?.toString()).toBe('-500'); // rent increase (adjust-rent)
    expect(s.closingBalance.toString()).toBe('9500'); // net amounts only: 4000 + 5500
    expect(s.totalDiscounts.toString()).toBe('500'); // 1000 - 500
  });

  it('omits a currency that has neither a balance nor activity', () => {
    const statements = buildCurrencyStatements({
      events: [],
      openingBalances: new Map([[USD, D(0)]]),
      currencyCodes: codes,
    });
    expect(statements).toEqual([]);
  });

  it('keeps a currency that only has an opening balance', () => {
    const [s] = buildCurrencyStatements({
      events: [],
      openingBalances: new Map([[AFN, D(250)]]),
      currencyCodes: codes,
    });
    expect(s.closingBalance.toString()).toBe('250');
    expect(s.transactions).toEqual([]);
  });

  it('has no float drift', () => {
    const [s] = buildCurrencyStatements({
      events: [charge('a', '2026-10-01', 0.1), charge('b', '2026-10-02', 0.2)],
      openingBalances: new Map(),
      currencyCodes: codes,
    });
    expect(s.closingBalance.toString()).toBe('0.3');
  });
});

describe('event mapping', () => {
  it('dates an electricity bill at the END of its period, and tags payments', () => {
    const bill = electricityBillEvent({
      id: 'e1',
      contractId: 'c1',
      periodStart: new Date('2026-07-01T00:00:00.000Z'),
      periodEnd: new Date('2026-09-30T00:00:00.000Z'),
      periodNumber: 3,
      totalAmount: D(900),
      currencyId: AFN,
      shop,
    });
    expect(bill.day).toBe('2026-09-30');
    expect(bill.direction).toBe('DEBIT');
    expect(bill.description).toContain('دورهٔ 3');

    const pay = electricityPaymentEvent({
      id: 'e2',
      paymentDate: new Date('2026-10-02T08:00:00.000Z'),
      amount: D(300),
      currencyId: AFN,
      receiptNumber: 'R-7',
      source: 'SECURITY_DEPOSIT',
      isOpeningEntry: false,
      shop,
    });
    expect(pay.direction).toBe('CREDIT');
    expect(pay.description).toContain('از محل امانت');
    expect(pay.description).toContain('رسید R-7');
  });
});

describe('combineOpeningBalances', () => {
  it('= charged - paid per currency across rent and electricity', () => {
    const m = combineOpeningBalances({
      rentCharged: [{ currencyId: AFN, amount: D(1000) }],
      rentPaid: [{ currencyId: AFN, amount: D(400) }],
      electricityBilled: [
        { currencyId: AFN, amount: D(200) },
        { currencyId: USD, amount: D(50) },
      ],
      electricityPaid: [{ currencyId: AFN, amount: D(100) }],
    });
    expect(m.get(AFN)?.toString()).toBe('700'); // 1000 - 400 + 200 - 100
    expect(m.get(USD)?.toString()).toBe('50');
  });
});

describe('legacyTopLevel (backward compatibility)', () => {
  it('mirrors the single currency block', () => {
    const statements = buildCurrencyStatements({
      events: [charge('a', '2026-10-01', 100)],
      openingBalances: new Map(),
      currencyCodes: codes,
    });
    const legacy = legacyTopLevel(statements);
    expect(legacy.isMultiCurrency).toBe(false);
    expect(legacy.closingBalance?.toString()).toBe('100');
    expect(legacy.transactions).toHaveLength(1);
  });

  it('returns zeros and an empty list for a tenant with no activity', () => {
    const legacy = legacyTopLevel([]);
    expect(legacy.isMultiCurrency).toBe(false);
    expect(legacy.openingBalance?.toString()).toBe('0');
    expect(legacy.closingBalance?.toString()).toBe('0');
    expect(legacy.transactions).toEqual([]);
  });

  it('does not sum different currencies together', () => {
    const statements = buildCurrencyStatements({
      events: [
        charge('a', '2026-10-01', 100, AFN),
        charge('b', '2026-10-01', 5, USD),
      ],
      openingBalances: new Map(),
      currencyCodes: codes,
    });
    const legacy = legacyTopLevel(statements);
    expect(legacy.isMultiCurrency).toBe(true);
    expect(legacy.closingBalance).toBeNull();
    expect(legacy.transactions).toEqual([]);
  });
});
