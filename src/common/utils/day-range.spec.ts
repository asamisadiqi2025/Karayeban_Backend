import { BadRequestException } from '@nestjs/common';
import { resolveOptionalDayRange } from './day-range';

describe('resolveOptionalDayRange', () => {
  it('returns nothing to filter on when no dates are given', () => {
    expect(resolveOptionalDayRange()).toEqual({
      fromCalendar: undefined,
      toCalendarExclusive: undefined,
      fromInstant: undefined,
      toInstantExclusive: undefined,
    });
  });

  it('uses UTC midnight for calendar days and Kabul midnight (UTC+04:30) for instants', () => {
    const r = resolveOptionalDayRange('2026-10-01', '2026-10-31');
    expect(r.fromCalendar?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(r.toCalendarExclusive?.toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
    expect(r.fromInstant?.toISOString()).toBe('2026-09-30T19:30:00.000Z');
    expect(r.toInstantExclusive?.toISOString()).toBe(
      '2026-10-31T19:30:00.000Z',
    );
  });

  it('includes the whole end day, and the same day for from = to', () => {
    const r = resolveOptionalDayRange('2026-10-05', '2026-10-05');
    expect(r.toCalendarExclusive!.getTime() - r.fromCalendar!.getTime()).toBe(
      24 * 60 * 60_000,
    );
    expect(r.toInstantExclusive!.getTime() - r.fromInstant!.getTime()).toBe(
      24 * 60 * 60_000,
    );
  });

  it('supports an open-ended range on either side', () => {
    const onlyFrom = resolveOptionalDayRange('2026-10-01');
    expect(onlyFrom.fromCalendar).toBeDefined();
    expect(onlyFrom.toCalendarExclusive).toBeUndefined();
    const onlyTo = resolveOptionalDayRange(undefined, '2026-10-01');
    expect(onlyTo.fromInstant).toBeUndefined();
    expect(onlyTo.toInstantExclusive).toBeDefined();
  });

  it('reads only the date part when a time is sent', () => {
    const r = resolveOptionalDayRange(
      '2026-10-01T23:59:59.000Z',
      '2026-10-01T00:00:01.000Z',
    );
    expect(r.fromCalendar?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('rejects an end before the start and an invalid date with 400', () => {
    expect(() => resolveOptionalDayRange('2026-10-02', '2026-10-01')).toThrow(
      BadRequestException,
    );
    expect(() => resolveOptionalDayRange('garbage')).toThrow(
      BadRequestException,
    );
  });
});
