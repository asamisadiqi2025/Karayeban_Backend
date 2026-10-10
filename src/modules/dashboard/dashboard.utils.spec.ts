import { Prisma } from '@prisma/client';
import {
  DailySeries,
  addToSeries,
  jalaliMonthRange,
  jalaliYearRange,
  kabulDayStart,
  kabulToday,
  lastDayKeys,
  percentChange,
  previousJalaliMonth,
  totalsByJalaliMonth,
} from './dashboard.utils';

const D = (v: number | string) => new Prisma.Decimal(v);

describe('dashboard.utils', () => {
  describe('jalali ranges (Kabul midnight, UTC+04:30)', () => {
    it('starts a Jalali year at Kabul midnight of 1 Hamal', () => {
      // 1405-01-01 = 2026-03-21 → Kabul midnight = 2026-03-20T19:30:00Z
      expect(jalaliYearRange(1405).from.toISOString()).toBe(
        '2026-03-20T19:30:00.000Z',
      );
    });

    it('makes consecutive months and years contiguous with no gap or overlap', () => {
      for (let m = 1; m < 12; m++) {
        expect(jalaliMonthRange(1405, m).to.getTime()).toBe(
          jalaliMonthRange(1405, m + 1).from.getTime(),
        );
      }
      expect(jalaliMonthRange(1405, 12).to.getTime()).toBe(
        jalaliYearRange(1406).from.getTime(),
      );
      expect(jalaliMonthRange(1405, 1).from.getTime()).toBe(
        jalaliYearRange(1405).from.getTime(),
      );
    });

    it('wraps the previous month across the year boundary', () => {
      expect(previousJalaliMonth(1405, 1)).toEqual({ year: 1404, month: 12 });
      expect(previousJalaliMonth(1405, 7)).toEqual({ year: 1405, month: 6 });
    });
  });

  describe('kabulToday', () => {
    it('uses the Kabul calendar day, not the UTC one', () => {
      // 20:00Z on 2026-10-06 is already 00:30 on 2026-10-07 in Kabul.
      const { today, year, month } = kabulToday(
        new Date('2026-10-06T20:00:00Z'),
      );
      expect(today.toISOString()).toBe('2026-10-07T00:00:00.000Z');
      expect({ year, month }).toEqual({ year: 1405, month: 7 }); // ۱۵ میزان ۱۴۰۵
    });
  });

  describe('lastDayKeys / kabulDayStart', () => {
    it('returns n ascending day keys ending today', () => {
      const today = new Date('2026-10-07T00:00:00Z');
      expect(lastDayKeys(today, 3)).toEqual([
        '2026-10-05',
        '2026-10-06',
        '2026-10-07',
      ]);
    });

    it('computes Kabul midnight of N days back', () => {
      const today = new Date('2026-10-07T00:00:00Z');
      expect(kabulDayStart(today, 0).toISOString()).toBe(
        '2026-10-06T19:30:00.000Z',
      );
      expect(kabulDayStart(today, 29).toISOString()).toBe(
        '2026-09-07T19:30:00.000Z',
      );
    });
  });

  describe('totalsByJalaliMonth', () => {
    it('buckets days into Jalali months of the requested year only', () => {
      const series: DailySeries = new Map();
      addToSeries(series, '2026-03-21', D(10)); // 1 Hamal 1405
      addToSeries(series, '2026-04-20', D(5)); // 31 Hamal 1405
      addToSeries(series, '2026-04-21', D(7)); // 1 Sawr 1405
      addToSeries(series, '2026-03-20', D(99)); // 30 Hoot 1404 → other year
      const totals = totalsByJalaliMonth(series, 1405);
      expect(totals[1].toString()).toBe('15');
      expect(totals[2].toString()).toBe('7');
      expect(totals.slice(3).every((t) => t.isZero())).toBe(true);
    });

    it('adds multiple entries on the same day', () => {
      const series: DailySeries = new Map();
      addToSeries(series, '2026-10-07', D('0.1'));
      addToSeries(series, '2026-10-07', D('0.2'));
      expect(series.get('2026-10-07')?.toString()).toBe('0.3'); // no float drift
    });
  });

  describe('percentChange', () => {
    it('rounds to one decimal', () => {
      expect(percentChange(D(1125), D(1000))).toBe(12.5);
      expect(percentChange(D(342000), D(352000))).toBe(-2.8);
    });

    it('is null when the previous period is zero', () => {
      expect(percentChange(D(10), D(0))).toBeNull();
    });
  });
});
