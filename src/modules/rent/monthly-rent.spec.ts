import { Prisma } from '@prisma/client';
import { monthlyRentFromDailyRate, naturalPeriodDays } from './monthly-rent';
import { RentService } from './rent.service';

const D = (n: number | string) => new Prisma.Decimal(n);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
// همان گردکردنِ ستون Decimal(18,4) در دیتابیس
const db4 = (v: Prisma.Decimal) => v.toDecimalPlaces(4);

describe('naturalPeriodDays', () => {
  it.each([
    ['2026-09-20', 30],
    ['2026-10-20', 31],
    ['2027-02-01', 28],
    ['2028-02-01', 29],
    ['2026-12-20', 31],
  ])('دوره‌ای که از %s شروع می‌شود %i روز است', (start, days) => {
    expect(naturalPeriodDays(day(start))).toBe(days);
  });
});

describe('monthlyRentFromDailyRate', () => {
  it('فاکتورِ عادی (بدونِ تعدیل): خودِ کرایهٔ امضاشده، بدونِ خطای گردکردن', () => {
    // 5000 ÷ 31 = 161.2903 (۴ رقم) → ×31 = 4999.9993
    const r = monthlyRentFromDailyRate(D('161.2903'), day('2026-10-20'), D(5000));
    expect(r.toString()).toBe('5000');
  });

  it('فاکتورِ ماهِ ناقص (۱۶ روزه) همان نرخِ روزانه را دارد → کرایهٔ ماهانهٔ درست، نه مبلغِ ناقص', () => {
    // مبلغ آن فاکتور 2580.6452 است ولی dailyRate همان 5000/31 است.
    const r = monthlyRentFromDailyRate(D('161.2903'), day('2026-10-20'), D(5000));
    expect(r.toString()).toBe('5000');
    expect(r.toString()).not.toBe('2580.6452');
  });

  it.each([
    ['2026-09-20', 30],
    ['2026-10-20', 31],
    ['2027-02-01', 28],
    ['2028-02-01', 29],
  ])('تعدیل‌شده تا آخر (۴٬۰۰۰ از ۵٬۰۰۰) در دوره‌ای که از %s شروع می‌شود → ۴٬۰۰۰', (start, days) => {
    const daily = db4(D(4000).div(days));
    const r = monthlyRentFromDailyRate(daily, day(start), D(5000));
    expect(r.toString()).toBe('4000');
  });

  it('کرایهٔ اعشاری (دالر) بعد از تعدیل: ۱۲۰٫۲۵ از ۱۵۰٫۵۰', () => {
    const daily = db4(D('120.25').div(31));
    expect(monthlyRentFromDailyRate(daily, day('2026-10-20'), D('150.50')).toString()).toBe('120.25');
  });

  it('کرایهٔ اعشاری بدونِ تعدیل: ۱۵۰٫۵۰ می‌ماند', () => {
    const daily = db4(D('150.50').div(31));
    expect(monthlyRentFromDailyRate(daily, day('2026-10-20'), D('150.50')).toString()).toBe('150.5');
  });
});

describe('رفت‌وبرگشت با تولیدکنندهٔ فاکتورها (RentService.generateChargesForContract)', () => {
  const generate = async (rent: Prisma.Decimal, start: string, end: string) => {
    const created: any[] = [];
    const tx: any = { rentCharges: { create: jest.fn(async ({ data }: any) => created.push(data)) } };
    const service = new RentService({} as never, {} as never);
    await service.generateChargesForContract(tx, {
      id: 'c1',
      marketId: 'm',
      shopId: 's',
      tenantId: 't',
      startDate: day(start),
      endDate: day(end),
      rent,
      currencyId: 'afn',
    });
    return created;
  };

  it.each([
    [D(5000), '2026-07-20', '2026-11-05'], // ۳٫۵ ماه، آخرین دورهٔ ۱۶ روزه
    [D(7000), '2026-09-20', '2027-09-20'], // ۱۲ ماهِ کامل
    [D(6500), '2026-01-31', '2026-08-15'], // شروعِ ۳۱ ام
    [D('333.33'), '2027-01-10', '2027-03-01'], // کرایهٔ اعشاری، دورهٔ فوریه
    [D(12000), '2026-12-05', '2027-01-07'], // کمتر از ۲ ماه
  ])('هر فاکتورِ ساخته‌شده (کامل یا ناقص) کرایه %s را برمی‌گرداند (%s تا %s)', async (rent, start, end) => {
    const created = await generate(rent, start, end);
    expect(created.length).toBeGreaterThan(0);
    for (const c of created) {
      const back = monthlyRentFromDailyRate(db4(c.dailyRate), c.periodStart, rent);
      expect(back.toString()).toBe(rent.toString());
    }
  });

  it('مثالِ باگ: آخرین فاکتور ۱۶ روزه است و مبلغش نصفه، ولی کرایهٔ ماهانه ۵٬۰۰۰ برمی‌گردد', async () => {
    const created = await generate(D(5000), '2026-07-20', '2026-11-05');
    const last = created[created.length - 1];
    expect(last.days).toBe(16);
    expect(db4(last.netAmount).toString()).toBe('2580.6452');
    expect(monthlyRentFromDailyRate(db4(last.dailyRate), last.periodStart, D(5000)).toString()).toBe('5000');
  });
});
