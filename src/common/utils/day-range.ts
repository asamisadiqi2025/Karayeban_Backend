import { BadRequestException } from '@nestjs/common';
import { KABUL_OFFSET_MINUTES } from './kabul-date';

const DAY_MS = 24 * 60 * 60_000;
const KABUL_OFFSET_MS = KABUL_OFFSET_MINUTES * 60_000;

export type OptionalDayRange = {
  // «روزِ تقویمی» (نیمه‌شبِ UTC): برای ستون‌هایی که یک روز نگه می‌دارند (مثل periodStart/periodEnd).
  fromCalendar?: Date;
  toCalendarExclusive?: Date;
  // «لحظه»: برای ستون‌هایی که لحظهٔ واقعی نگه می‌دارند (مثل paymentDate). مرزِ روز نیمه‌شبِ کابل
  // است (UTC+04:30)، نه نیمه‌شبِ UTC — پرداختِ ساعت ۱ بامدادِ کابل باید در همان روز حساب شود.
  fromInstant?: Date;
  toInstantExclusive?: Date;
};

function parseDay(value: string): Date {
  // فقط بخشِ تاریخ (۱۰ حرفِ اول) خوانده می‌شود؛ ساعت اگر باشد نادیده است.
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('تاریخ نامعتبر است');
  }
  return date;
}

// بازهٔ «روزی» برای فیلترِ لیست‌ها. هر دو سر اختیاری و شاملِ کلِ همان روزند (to = تا آخرِ آن روز).
// بدون هیچ‌کدام، همه‌چیز undefined است (یعنی فیلتر اعمال نمی‌شود).
export function resolveOptionalDayRange(
  from?: string,
  to?: string,
): OptionalDayRange {
  const fromCalendar = from ? parseDay(from) : undefined;
  const toCalendar = to ? parseDay(to) : undefined;
  if (fromCalendar && toCalendar && toCalendar < fromCalendar) {
    throw new BadRequestException(
      'تاریخ پایان باید بعد یا برابر تاریخ شروع باشد',
    );
  }
  const toCalendarExclusive = toCalendar
    ? new Date(toCalendar.getTime() + DAY_MS)
    : undefined;

  return {
    fromCalendar,
    toCalendarExclusive,
    fromInstant: fromCalendar
      ? new Date(fromCalendar.getTime() - KABUL_OFFSET_MS)
      : undefined,
    toInstantExclusive: toCalendarExclusive
      ? new Date(toCalendarExclusive.getTime() - KABUL_OFFSET_MS)
      : undefined,
  };
}
