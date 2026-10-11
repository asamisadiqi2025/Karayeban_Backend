import { BadRequestException } from '@nestjs/common';
import { kabulDate } from '../../common/utils/kabul-date';

// امانت (پیش‌پرداخت) قرارداد دو حالتِ کاملاً متفاوتِ مالی دارد:
//  • «همین الان دریافت می‌شود» (securityDepositIsOpeningEntry=false): پول به یک حساب اضافه می‌شود و
//    در دفتر کل ردیفِ IN می‌خورد.
//  • «قبلاً — قبل از راه‌اندازیِ سیستم — گرفته شده» (=true): هیچ حسابی تغییر نمی‌کند؛ چون آن پول
//    از قبل در موجودیِ افتتاحیهٔ حساب‌ها هست و دوباره اضافه‌کردنش موجودی را بی‌صدا دوبار می‌شمارد.
// برای قراردادی که از روزِ قبل از امروز شروع شده (مهاجرتِ قراردادهای در جریان) این دو حالت را نمی‌شود
// حدس زد؛ پس انتخابِ صریح اجباری است. قراردادِ تازه (شروع امروز/آینده) بدونِ تغییر کار می‌کند.
// ترکیبِ «افتتاحیه» + حساب/نرخ هم متناقض است (به هیچ حسابی چیزی واریز نمی‌شود) و رد می‌شود تا
// کسی فکر نکند پول به آن حساب رفته.
export function assertSecurityDepositIntent(
  input: {
    startDate: Date;
    securityDeposit?: number | null;
    isOpeningEntry?: boolean;
    accountId?: string;
    exchangeRate?: number;
  },
  now: Date = new Date(),
): void {
  if (!input.securityDeposit) return;

  if (input.isOpeningEntry === true) {
    if (input.accountId !== undefined || input.exchangeRate !== undefined) {
      throw new BadRequestException(
        'امانتِ قبلاً دریافت‌شده (securityDepositIsOpeningEntry=true) به هیچ حسابی واریز نمی‌شود؛ ' +
          'securityDepositAccountId و securityDepositExchangeRate را نفرستید — اگر امانت همین الان ' +
          'دریافت می‌شود، securityDepositIsOpeningEntry را false بگذارید',
      );
    }
    return;
  }

  if (
    input.isOpeningEntry === undefined &&
    kabulDate(input.startDate).getTime() < kabulDate(now).getTime()
  ) {
    const startDay = kabulDate(input.startDate).toISOString().slice(0, 10);
    throw new BadRequestException(
      `این قرارداد از قبل (${startDay}) شروع شده و امانت دارد؛ مشخص کنید امانت چگونه دریافت شده: ` +
        'securityDepositIsOpeningEntry=true یعنی امانت قبل از راه‌اندازیِ سیستم گرفته شده و هیچ حسابی ' +
        'افزایش نمی‌یابد (قراردادهای قدیمی/مهاجرت)؛ false یعنی امانت همین الان دریافت می‌شود و ' +
        'باید securityDepositAccountId را هم بدهید',
    );
  }
}
