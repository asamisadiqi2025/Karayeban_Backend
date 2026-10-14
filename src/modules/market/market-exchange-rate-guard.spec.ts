import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MarketService } from './market.service';

jest.mock('../../common/utils/ensure-currency-enabled-for-market', () => ({
  ensureCurrencyEnabledForMarket: jest.fn(async () => undefined),
}));

const D = (v: number | string) => new Prisma.Decimal(v);
const d = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const MK = 'mk';
const AFN = 'afn';
const meta = { ip: '127.0.0.1', userAgent: 'jest' };
const user = { id: 'u1' };

type Row = { currencyId: string; rateToBase: Prisma.Decimal; effectiveDate: Date };
const row = (ymd: string, rate: string, currencyId = AFN): Row => ({
  currencyId,
  rateToBase: D(rate),
  effectiveDate: d(ymd),
});

function setup(rows: Row[]) {
  const upsert = jest.fn(async ({ create, update }: any) => ({
    id: 'r1',
    ...(create ?? {}),
    ...(update ?? {}),
    currency: {},
  }));
  const prisma: any = {
    user: { findUnique: jest.fn(async () => ({ id: 'u1', role: 'ADMIN', marketId: MK })) },
    market: { findUnique: jest.fn(async () => ({ id: MK, baseCurrencyId: 'usd' })) },
    currency: { findUnique: jest.fn(async () => ({ id: AFN })) },
    exchangeRate: {
      findUnique: jest.fn(async ({ where }: any) => {
        const k = where.marketId_currencyId_effectiveDate;
        return (
          rows.find(
            (r) => r.currencyId === k.currencyId && r.effectiveDate.getTime() === k.effectiveDate.getTime(),
          ) ?? null
        );
      }),
      findFirst: jest.fn(async ({ where, orderBy }: any) => {
        const t = (where.effectiveDate.lt ?? where.effectiveDate.gt).getTime();
        const lt = where.effectiveDate.lt !== undefined;
        const found = rows
          .filter((r) => r.currencyId === where.currencyId)
          .filter((r) => (lt ? r.effectiveDate.getTime() < t : r.effectiveDate.getTime() > t))
          .sort((a, b) =>
            orderBy.effectiveDate === 'desc'
              ? b.effectiveDate.getTime() - a.effectiveDate.getTime()
              : a.effectiveDate.getTime() - b.effectiveDate.getTime(),
          );
        return found[0] ?? null;
      }),
      upsert,
    },
  };
  const audit = { record: jest.fn(async (_entry: any) => undefined) };
  const service = new MarketService(prisma, {} as any, {} as any, audit as any);
  return { service, upsert, audit };
}

const dto = (rateToBase: number, effectiveDate: string, extra: object = {}): any => ({
  currencyId: AFN,
  rateToBase,
  effectiveDate,
  ...extra,
});

// جدولِ نرخِ واقعیِ دیتابیس قبل از اشتباه
const CLEAN = [row('2026-09-24', '0.014'), row('2026-09-29', '0.013')];

describe('MarketService.setExchangeRate — جلوگیری از خطای تایپیِ نرخ', () => {
  it('همان اشتباهِ واقعی: ۰٫۰۰۱۴ بعد از ۰٫۰۱۳ بدونِ تأیید → ۴۰۹ و هیچ چیز نوشته نمی‌شود', async () => {
    const { service, upsert, audit } = setup(CLEAN);
    const err = await service.setExchangeRate(user, MK, dto(0.0014, '2026-10-01'), meta).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toContain('0.0014');
    expect(err.message).toContain('0.013');
    expect(err.message).toContain('confirmLargeChange=true');
    expect(upsert).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('با confirmLargeChange=true ثبت می‌شود و دلیلِ تأیید در audit می‌ماند', async () => {
    const { service, upsert, audit } = setup(CLEAN);
    await service.setExchangeRate(user, MK, dto(0.0014, '2026-10-01', { confirmLargeChange: true }), meta);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0][0]).toMatchObject({ entityType: 'ExchangeRate', action: 'CREATE' });
    expect((audit.record.mock.calls[0][0] as any).reason).toContain('confirmLargeChange');
  });

  it('نرخِ عادی (۰٫۰۱۳۵) بدونِ هیچ تأییدی ثبت می‌شود و دلیلی در audit نیست', async () => {
    const { service, upsert, audit } = setup(CLEAN);
    await service.setExchangeRate(user, MK, dto(0.0135, '2026-10-01'), meta);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect((audit.record.mock.calls[0][0] as any).reason).toBeUndefined();
  });

  it('اصلاحِ ردیفِ غلطِ موجود (۰٫۰۰۱۴ → ۰٫۰۱۴ در همان روز) بدونِ تأیید مجاز است', async () => {
    const rows = [...CLEAN, row('2026-10-01', '0.0014'), row('2026-10-02', '0.014')];
    const { service, upsert, audit } = setup(rows);
    await service.setExchangeRate(user, MK, dto(0.014, '2026-10-01'), meta);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0][0]).toMatchObject({ action: 'UPDATE' });
  });

  it('ثبتِ عقب‌گردِ یک روزِ میانی با هر دو همسایه مقایسه می‌شود', async () => {
    const { service, upsert } = setup([row('2026-09-29', '0.013'), row('2026-10-02', '0.014')]);
    const err = await service.setExchangeRate(user, MK, dto(0.0014, '2026-10-01'), meta).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toContain('نرخِ قبلی');
    expect(err.message).toContain('نرخِ بعدی');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('اولین نرخِ یک ارزِ جدید هر مقداری باشد مجاز است؛ نرخِ ارزِ دیگر دخیل نیست', async () => {
    const { service, upsert } = setup([row('2026-09-29', '0.013', AFN)]);
    await service.setExchangeRate(user, MK, { ...dto(0.0000016667, '2026-10-01'), currencyId: AFN, confirmLargeChange: true }, meta);
    const other = setup([row('2026-09-29', '0.013', 'all')]); // فقط ارزِ دیگر نرخ دارد
    await other.service.setExchangeRate(user, MK, dto(5, '2026-10-01'), meta);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(other.upsert).toHaveBeenCalledTimes(1);
  });
});
