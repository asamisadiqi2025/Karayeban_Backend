import { BadRequestException } from '@nestjs/common';
import { assertSecurityDepositIntent } from './security-deposit-intent';

// «الان» = ۹ اکتبر ۲۰۲۶ ظهر به وقتِ کابل (۰۷:۳۰ UTC)
const NOW = new Date('2026-10-09T07:30:00Z');
const d = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

describe('assertSecurityDepositIntent — امانتِ قراردادِ قدیمی نباید بی‌صدا دوبار شمرده شود', () => {
  it('قرارداد قدیمی + امانت + بدونِ انتخابِ صریح → رد می‌شود (پیام، هر دو راه را توضیح می‌دهد)', () => {
    const run = () =>
      assertSecurityDepositIntent({ startDate: d('2026-03-01'), securityDeposit: 20000 }, NOW);
    expect(run).toThrow(BadRequestException);
    expect(run).toThrow(/2026-03-01/);
    expect(run).toThrow(/securityDepositIsOpeningEntry=true/);
    expect(run).toThrow(/securityDepositAccountId/);
  });

  it('قرارداد قدیمی + امانت + حسابِ داده‌شده ولی بدونِ فلگ → باز هم رد می‌شود (حدس نمی‌زنیم)', () => {
    expect(() =>
      assertSecurityDepositIntent(
        { startDate: d('2026-03-01'), securityDeposit: 20000, accountId: 'acc1' },
        NOW,
      ),
    ).toThrow(BadRequestException);
  });

  it('قرارداد قدیمی + isOpeningEntry=true (بدونِ حساب) → مجاز', () => {
    expect(() =>
      assertSecurityDepositIntent(
        { startDate: d('2026-03-01'), securityDeposit: 20000, isOpeningEntry: true },
        NOW,
      ),
    ).not.toThrow();
  });

  it('قرارداد قدیمی + isOpeningEntry=false (امانت همین الان گرفته می‌شود) → مجاز', () => {
    expect(() =>
      assertSecurityDepositIntent(
        { startDate: d('2026-03-01'), securityDeposit: 20000, isOpeningEntry: false, accountId: 'acc1' },
        NOW,
      ),
    ).not.toThrow();
  });

  it('قراردادِ تازه (شروع «امروز» به وقتِ کابل) بدونِ فلگ → مجاز و بدونِ تغییر', () => {
    expect(() =>
      assertSecurityDepositIntent(
        { startDate: d('2026-10-09'), securityDeposit: 20000, accountId: 'acc1' },
        NOW,
      ),
    ).not.toThrow();
  });

  it('قراردادِ آینده بدونِ فلگ → مجاز', () => {
    expect(() =>
      assertSecurityDepositIntent(
        { startDate: d('2026-10-20'), securityDeposit: 20000, accountId: 'acc1' },
        NOW,
      ),
    ).not.toThrow();
  });

  it('«دیروز» به وقتِ کابل قدیمی حساب می‌شود، حتی اگر در UTC هنوز همان روز باشد', () => {
    // ۰۰:۳۰ بامداد کابلِ ۱۰ اکتبر = ۲۰:۰۰ UTC روزِ ۹ اکتبر → «امروز» کابل ۱۰ اکتبر است.
    const justAfterKabulMidnight = new Date('2026-10-09T20:00:00Z');
    expect(() =>
      assertSecurityDepositIntent(
        { startDate: d('2026-10-09'), securityDeposit: 20000, accountId: 'acc1' },
        justAfterKabulMidnight,
      ),
    ).toThrow(BadRequestException);
  });

  it('isOpeningEntry=true همراهِ حساب یا نرخ → متناقض است و رد می‌شود', () => {
    for (const extra of [{ accountId: 'acc1' }, { exchangeRate: 0.014 }]) {
      expect(() =>
        assertSecurityDepositIntent(
          { startDate: d('2026-03-01'), securityDeposit: 20000, isOpeningEntry: true, ...extra },
          NOW,
        ),
      ).toThrow(/به هیچ حسابی واریز نمی‌شود/);
    }
  });

  it('بدونِ امانت هیچ چیز بررسی نمی‌شود (حتی قراردادِ قدیمی)', () => {
    expect(() => assertSecurityDepositIntent({ startDate: d('2026-03-01') }, NOW)).not.toThrow();
    expect(() =>
      assertSecurityDepositIntent({ startDate: d('2026-03-01'), securityDeposit: 0 }, NOW),
    ).not.toThrow();
  });
});
