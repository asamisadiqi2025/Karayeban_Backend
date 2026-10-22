import { Prisma } from '@prisma/client';

const DAY_MS = 1000 * 60 * 60 * 24;

// dailyRate در دیتابیس ۴ رقم اعشار دارد؛ ضرب در طول دوره حداکثر ~۰٫۰۰۲ خطای گردکردن می‌سازد.
const ROUNDING_TOLERANCE = new Prisma.Decimal('0.01');

// طول «طبیعیِ» دوره‌ای که از periodStart شروع می‌شود (یک ماهِ میلادی) — دقیقاً همان فرمولِ
// fullPeriodDays در RentService.generateChargesForContract، تا نرخ روزانهٔ ذخیره‌شده با همان مبنا برگردد.
export function naturalPeriodDays(periodStart: Date): number {
  const naturalEnd = new Date(periodStart);
  naturalEnd.setUTCMonth(naturalEnd.getUTCMonth() + 1);
  return Math.round((naturalEnd.getTime() - periodStart.getTime()) / DAY_MS);
}

// کرایهٔ «ماهانهٔ جاری» از روی نرخ روزانهٔ یک فاکتور (نه از روی مبلغ آن). مبلغِ فاکتور دو چیزِ غیرِ کرایه هم
// در خودش دارد: کوتاهیِ دوره (آخرین ماهِ یک قرارداد با طولِ غیرِ ماهِ کامل) و بخششِ یک‌باره (discount-debt).
// ولی dailyRate فقط با ساخت فاکتور و adjust-rent عوض می‌شود، پس همیشه «نرخ توافق‌شدهٔ همان دوره» است.
// اگر نتیجه با کرایهٔ امضاشده یکی باشد (تعدیلی در کار نیست) خودِ کرایهٔ امضاشده برمی‌گردد (بدونِ خطای گردکردن).
export function monthlyRentFromDailyRate(
  dailyRate: Prisma.Decimal,
  periodStart: Date,
  signedRent: Prisma.Decimal,
): Prisma.Decimal {
  const raw = dailyRate.mul(naturalPeriodDays(periodStart));
  if (raw.sub(signedRent).abs().lte(ROUNDING_TOLERANCE)) return signedRent;
  return raw.toDecimalPlaces(2);
}
