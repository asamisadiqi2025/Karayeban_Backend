import { BadRequestException } from '@nestjs/common';
import { assertPaymentDateNotInFuture } from './assert-payment-date';

// "now" below = 2026-10-09 22:00 UTC = 02:30 on 2026-10-10 in Kabul (UTC+04:30)
const NOW = new Date('2026-10-09T22:00:00.000Z');

describe('assertPaymentDateNotInFuture (Kabul calendar day)', () => {
  it('allows today, yesterday and old dates', () => {
    expect(() =>
      assertPaymentDateNotInFuture(new Date('2026-10-10T00:00:00.000Z'), NOW),
    ).not.toThrow(); // date-only "today" (Kabul)
    expect(() =>
      assertPaymentDateNotInFuture(new Date('2026-10-09T00:00:00.000Z'), NOW),
    ).not.toThrow();
    expect(() =>
      assertPaymentDateNotInFuture(new Date('2025-01-01T00:00:00.000Z'), NOW),
    ).not.toThrow();
  });

  it('allows a later time on the same Kabul day (client/server clock skew)', () => {
    expect(() =>
      assertPaymentDateNotInFuture(new Date('2026-10-10T18:00:00.000Z'), NOW),
    ).not.toThrow(); // 22:30 Kabul, same day
  });

  it('rejects tomorrow (Kabul), even if it is only hours away', () => {
    // 19:30Z on the 10th = 00:00 on the 11th in Kabul
    expect(() =>
      assertPaymentDateNotInFuture(new Date('2026-10-10T19:30:00.000Z'), NOW),
    ).toThrow(BadRequestException);
    expect(() =>
      assertPaymentDateNotInFuture(new Date('2026-10-11T00:00:00.000Z'), NOW),
    ).toThrow(BadRequestException);
    expect(() =>
      assertPaymentDateNotInFuture(new Date('2100-01-01T00:00:00.000Z'), NOW),
    ).toThrow(BadRequestException);
  });

  it('uses the Kabul day, not the UTC day: at 22:00Z the UTC date is still the 9th but Kabul is the 10th', () => {
    // a date-only "2026-10-10" is NOT in the future for a Kabul user at 02:30 on the 10th
    expect(() =>
      assertPaymentDateNotInFuture(new Date('2026-10-10'), NOW),
    ).not.toThrow();
    // and 23:59 UTC on the 9th is already 04:29 on the 10th in Kabul -> same day as now
    expect(() =>
      assertPaymentDateNotInFuture(new Date('2026-10-09T23:59:00.000Z'), NOW),
    ).not.toThrow();
  });

  it('rejects an invalid date with a clear message', () => {
    const err = (() => {
      try {
        assertPaymentDateNotInFuture(new Date('garbage'), NOW);
      } catch (e) {
        return e as BadRequestException;
      }
    })();
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err?.message).toContain('نامعتبر');
  });

  it('defaults "now" to the current time', () => {
    expect(() => assertPaymentDateNotInFuture(new Date())).not.toThrow();
    expect(() =>
      assertPaymentDateNotInFuture(new Date(Date.now() + 3 * 24 * 3600_000)),
    ).toThrow(BadRequestException);
  });
});
