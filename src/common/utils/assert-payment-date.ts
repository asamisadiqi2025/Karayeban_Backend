import { BadRequestException } from '@nestjs/common';
import { kabulDate } from './kabul-date';

// تاریخِ پرداخت نباید در «آینده» باشد: پولی که هنوز نگرفته‌ایم نباید در دفتر کل، صورت‌حساب و
// گزارش‌ها دیده شود. مقایسه با «روزِ تقویمیِ کابل» است، نه لحظه — تا
//  - تاریخِ بدونِ ساعتِ «امروز» ('2026-10-09' = نیمه‌شبِ UTC) همیشه مجاز بماند،
//  - پرداختی با ساعتِ دیرتر در همان روز (اختلافِ ساعتِ کلاینت/سرور) رد نشود،
//  - و «فردا» (به وقتِ کابل) حتی چند ساعت مانده به آن هم رد شود.
// گذشته عمداً محدود نمی‌شود: ثبتِ دیرهنگامِ رسیدهای چند روز قبل (تعطیلات، قطعی) عادی است؛ محدودکردنِ
// عقب‌گرد کارِ «قفلِ دورهٔ مالی» است، نه این تابع.
export function assertPaymentDateNotInFuture(
  paymentDate: Date,
  now: Date = new Date(),
): void {
  if (Number.isNaN(paymentDate.getTime())) {
    throw new BadRequestException('تاریخ پرداخت نامعتبر است');
  }
  if (kabulDate(paymentDate).getTime() > kabulDate(now).getTime()) {
    throw new BadRequestException('تاریخ پرداخت نمی‌تواند در آینده باشد');
  }
}
