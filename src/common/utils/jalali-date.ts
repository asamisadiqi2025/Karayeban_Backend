import { toJalaali, toGregorian, jalaaliMonthLength } from 'jalaali-js';

// تبدیل میلادی به هجری‌شمسی — روی کتابخانهٔ تست‌شدهٔ jalaali-js (نه پیاده‌سازی دستی).
// عمداً از اجزای UTC (نه Date محلی) استفاده می‌شود تا نتیجه به تایم‌زون سرور بستگی نداشته
// باشد — همان تاریخی که در دیتابیس ذخیره است، همیشه همان برج را بدهد.
// فقط سال/ماه لازم است (برای RentPayment.month/year)، پس روز گرفته می‌شود ولی برگردانده نمی‌شود.
export function toJalaliYearMonth(date: Date): { year: number; month: number } {
  const { jy, jm } = toJalaali(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  return { year: jy, month: jm };
}

// نام برج‌های افغانستان (نه ایران) — اندیس با RentPayment.month (۱ تا ۱۲) یکی است، پس
// AFGHAN_SOLAR_MONTHS[6] مستقیم می‌شود «سنبله». اندیس ۰ خالی است، استفاده نمی‌شود.
// این تنها منبع رسمیِ این نام‌ها در کل سیستم است — هرجا (بک‌اند یا از طریق
// GET /rent/jalali-months برای فرانت) لازم شد، از همین‌جا خوانده شود، دوباره تایپ نشود.
export const AFGHAN_SOLAR_MONTHS = [
  '',
  'حمل',
  'ثور',
  'جوزا',
  'سرطان',
  'اسد',
  'سنبله',
  'میزان',
  'عقرب',
  'قوس',
  'جدی',
  'دلو',
  'حوت',
] as const;

// اولین روز یک ماه شمسی (میلادی، UTC نیمه‌شب) — برای مرز شروعِ دوره‌های میترخوانی.
export function jalaliMonthStart(year: number, month: number): Date {
  const { gy, gm, gd } = toGregorian(year, month, 1);
  return new Date(Date.UTC(gy, gm - 1, gd));
}

// آخرین روز یک ماه شمسی (میلادی، UTC نیمه‌شب) — طول ماه (۲۹ تا ۳۱ روز، با قاعدهٔ کبیسه
// برای حوت) را jalaali-js حساب می‌کند، دستی حدس زده نمی‌شود.
export function jalaliMonthEnd(year: number, month: number): Date {
  const day = jalaaliMonthLength(year, month);
  const { gy, gm, gd } = toGregorian(year, month, day);
  return new Date(Date.UTC(gy, gm - 1, gd));
}
