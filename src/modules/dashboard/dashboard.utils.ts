import { Prisma } from '@prisma/client';
import { KABUL_OFFSET_MINUTES, kabulDate } from '../../common/utils/kabul-date';
import {
  AFGHAN_SOLAR_MONTHS,
  jalaliMonthStart,
  toJalaliYearMonth,
} from '../../common/utils/jalali-date';

const DAY_MS = 24 * 60 * 60_000;
const KABUL_OFFSET_MS = KABUL_OFFSET_MINUTES * 60_000;

export type DateRange = { from: Date; to: Date }; // [from, to) — to خارج از بازه است

// نیمه‌شبِ «وقتِ کابل» برای اولِ یک برجِ هجری‌شمسی، به‌صورت لحظهٔ واقعیِ UTC — تا بازه‌ها با
// ستون‌های timestamptz (entry_date, expense_date, ...) درست مقایسه شوند، نه با نیمه‌شبِ UTC.
function kabulMonthStart(year: number, month: number): Date {
  return new Date(jalaliMonthStart(year, month).getTime() - KABUL_OFFSET_MS);
}

export function jalaliMonthRange(year: number, month: number): DateRange {
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    from: kabulMonthStart(year, month),
    to: kabulMonthStart(nextYear, nextMonth),
  };
}

export function jalaliYearRange(year: number): DateRange {
  return { from: kabulMonthStart(year, 1), to: kabulMonthStart(year + 1, 1) };
}

export function previousJalaliMonth(
  year: number,
  month: number,
): { year: number; month: number } {
  return month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 };
}

// لحظهٔ نیمه‌شبِ کابل برای `daysBack` روز قبل از `today` (که خودش نیمه‌شبِ UTC از تاریخِ کابل است).
export function kabulDayStart(today: Date, daysBack: number): Date {
  return new Date(today.getTime() - daysBack * DAY_MS - KABUL_OFFSET_MS);
}

// «امروز» به وقتِ کابل + برجِ هجری‌شمسیِ آن.
export function kabulToday(now: Date = new Date()) {
  const today = kabulDate(now);
  return { today, ...toJalaliYearMonth(today) };
}

export function monthName(month: number): string {
  return AFGHAN_SOLAR_MONTHS[month] ?? '';
}

// کلیدِ روزِ تقویمی ('YYYY-MM-DD') از یک Date که نیمه‌شبِ UTC است (خروجیِ ::date در Postgres).
export function dayKey(day: Date): string {
  return day.toISOString().slice(0, 10);
}

// n روزِ آخر تا و با «امروز» (قدیمی‌ترین اول) — برای sparkline کارت‌ها.
export function lastDayKeys(today: Date, n: number): string[] {
  return Array.from({ length: n }, (_, i) =>
    dayKey(new Date(today.getTime() - (n - 1 - i) * DAY_MS)),
  );
}

export type DailySeries = Map<string, Prisma.Decimal>;

export function addToSeries(
  series: DailySeries,
  key: string,
  value: Prisma.Decimal,
): void {
  series.set(key, (series.get(key) ?? new Prisma.Decimal(0)).add(value));
}

// جمعِ سری‌ی روزانه به تفکیکِ برجِ هجری‌شمسیِ یک سال؛ اندیس ۱..۱۲ (اندیس ۰ استفاده نمی‌شود).
export function totalsByJalaliMonth(
  series: DailySeries,
  year: number,
): Prisma.Decimal[] {
  const totals = Array.from({ length: 13 }, () => new Prisma.Decimal(0));
  for (const [key, value] of series) {
    const { year: y, month } = toJalaliYearMonth(
      new Date(`${key}T00:00:00.000Z`),
    );
    if (y === year) totals[month] = totals[month].add(value);
  }
  return totals;
}

export function totalForMonth(
  series: DailySeries,
  year: number,
  month: number,
): Prisma.Decimal {
  return totalsByJalaliMonth(series, year)[month];
}

export function sparkline(series: DailySeries, keys: string[]): number[] {
  return keys.map((k) => (series.get(k) ?? new Prisma.Decimal(0)).toNumber());
}

// درصدِ تغییر نسبت به دورهٔ قبل (یک رقم اعشار). اگر دورهٔ قبل صفر بود، درصد تعریف‌نشده است → null.
export function percentChange(
  current: Prisma.Decimal,
  previous: Prisma.Decimal,
): number | null {
  if (previous.isZero()) return null;
  return (
    Math.round(current.sub(previous).div(previous.abs()).mul(1000).toNumber()) /
    10
  );
}
