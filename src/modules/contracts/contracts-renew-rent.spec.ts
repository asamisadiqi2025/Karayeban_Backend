import { Prisma } from '@prisma/client';
import { ContractsService } from './contracts.service';

jest.mock('../../common/utils/resolve-rate-to-base', () => ({
  resolveRateToBase: jest.fn(async (_db: unknown, p: { amount: Prisma.Decimal }) => ({
    exchangeRate: new Prisma.Decimal(1),
    baseCurrencyAmount: p.amount,
  })),
}));

const D = (n: number | string) => new Prisma.Decimal(n);
const DAY = 86400000;
const user = { id: 'u1' };
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const renewDto = (over: object = {}): any => ({
  newEndDate: new Date(Date.now() + 365 * DAY).toISOString().slice(0, 10),
  ...over,
});

// آخرین فاکتورِ قرارداد، همان‌طور که findFirst با select {dailyRate, periodStart} برمی‌گرداند.
type Last = { dailyRate: Prisma.Decimal; periodStart: Date } | null;

function setup(lastCharge: Last) {
  const contractRow = {
    id: 'c1',
    marketId: 'mk',
    shopId: 's1',
    tenantId: 't1',
    currencyId: 'afn',
    status: 'active',
    securityDepositRemaining: D(0),
    securityDeposit: D(0),
    securityDepositAccountId: null,
    guarantorId: null,
    startDate: new Date(Date.now() - 400 * DAY),
    endDate: new Date(Date.now() - DAY), // تمام‌شده → تمدید مجاز
    rent: D(5000),
  };
  const tx: any = {
    $executeRaw: jest.fn(async () => 0),
    rentCharges: {
      findFirst: jest.fn(async () => lastCharge),
      findMany: jest.fn(async () => []),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 0 })),
      aggregate: jest.fn(async () => ({ _sum: { remainingAmount: D(0) } })),
    },
    electricityBill: { findMany: jest.fn(async () => []) },
    contract: {
      update: jest.fn(async () => ({})),
      create: jest.fn(async ({ data }: any) => ({ id: 'c2', ...data })),
      findUniqueOrThrow: jest.fn(async () => contractRow),
    },
    contractStatusHistory: { create: jest.fn(async () => ({})) },
    shop: { update: jest.fn(async () => ({})) },
    currency: { findMany: jest.fn(async () => [{ id: 'afn', code: 'AFN' }]) },
    debtPromise: { findMany: jest.fn(async () => []), update: jest.fn(), create: jest.fn() },
  };
  const prisma: any = {
    user: {
      findUnique: jest.fn(async () => ({ id: 'u1', role: 'ADMIN', marketId: 'mk', grantedPermissions: null })),
    },
    contract: { findUnique: jest.fn(async () => contractRow), findFirst: jest.fn(async () => null) },
    rentCharges: tx.rentCharges,
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const rentService: any = {
    recomputeRentDebt: jest.fn(async () => undefined),
    generateChargesForContract: jest.fn(async () => undefined),
  };
  const electricityService: any = { getOpenDebtByCurrencyForShop: jest.fn(async () => []) };
  const audit = { record: jest.fn(async () => undefined) };
  const service = new ContractsService(prisma, rentService, electricityService, audit as any);
  return { service, tx, prisma, rentService };
}

const newRentOf = (tx: any) => tx.contract.create.mock.calls[0][0].data.rent.toString();

describe('تمدید بدونِ ذکرِ کرایه — کرایهٔ ماهانه از نرخِ روزانهٔ آخرین فاکتور', () => {
  it('بدونِ تعدیل: همان کرایهٔ قرارداد (۵٬۰۰۰)', async () => {
    const { service, tx } = setup({ dailyRate: D('161.2903'), periodStart: day('2026-10-20') });
    await service.renew(user, 'c1', renewDto());
    expect(newRentOf(tx)).toBe('5000');
  });

  it('باگِ ماهِ ناقص: آخرین فاکتور ۱۶ روزه (مبلغ 2580.6452) → کرایهٔ جدید ۵٬۰۰۰ است، نه 2580.6452', async () => {
    // فاکتورِ ماهِ ناقص مبلغش نصفه است ولی dailyRate همان 5000/31 است؛ تمدید باید فقط به dailyRate نگاه کند.
    const { service, tx, prisma } = setup({ dailyRate: D('161.2903'), periodStart: day('2026-10-20') });
    await service.renew(user, 'c1', renewDto());
    expect(newRentOf(tx)).toBe('5000');
    expect(prisma.rentCharges.findFirst.mock.calls[0][0].select).toEqual({ dailyRate: true, periodStart: true });
  });

  it('کاهشی که تا آخر قرارداد بوده (۴٬۰۰۰) ادامه پیدا می‌کند (رفتارِ عمدیِ قبلی)', async () => {
    const { service, tx } = setup({ dailyRate: D('129.0323'), periodStart: day('2026-10-20') }); // 4000/31
    await service.renew(user, 'c1', renewDto());
    expect(newRentOf(tx)).toBe('4000');
  });

  it('کاهشِ ۳۰ روزه (۴٬۵۰۰ ÷ ۳۰) هم دقیق برمی‌گردد', async () => {
    const { service, tx } = setup({ dailyRate: D('150'), periodStart: day('2026-09-20') });
    await service.renew(user, 'c1', renewDto());
    expect(newRentOf(tx)).toBe('4500');
  });

  it('کرایهٔ صریح در تمدید همیشه مقدم است', async () => {
    const { service, tx } = setup({ dailyRate: D('129.0323'), periodStart: day('2026-10-20') });
    await service.renew(user, 'c1', renewDto({ rent: 6500 }));
    expect(newRentOf(tx)).toBe('6500');
  });

  it('قراردادی که فاکتور ندارد: کرایهٔ امضاشده', async () => {
    const { service, tx } = setup(null);
    await service.renew(user, 'c1', renewDto());
    expect(newRentOf(tx)).toBe('5000');
  });

  it('فاکتورهای قراردادِ جدید با همان کرایهٔ محاسبه‌شده ساخته می‌شوند', async () => {
    const { service, rentService } = setup({ dailyRate: D('161.2903'), periodStart: day('2026-10-20') });
    await service.renew(user, 'c1', renewDto());
    const arg = rentService.generateChargesForContract.mock.calls[0][1];
    expect(arg.rent.toString()).toBe('5000');
  });
});
