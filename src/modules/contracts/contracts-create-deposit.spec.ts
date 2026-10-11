import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ContractsService } from './contracts.service';
import { kabulDate } from '../../common/utils/kabul-date';

jest.mock('../../common/utils/ensure-market-setup-complete', () => ({
  ensureMarketSetupComplete: jest.fn(async () => undefined),
}));
jest.mock('../../common/utils/ensure-currency-enabled-for-market', () => ({
  ensureCurrencyEnabledForMarket: jest.fn(async () => undefined),
}));
jest.mock('../../common/utils/resolve-rate-to-base', () => ({
  resolveRateToBase: jest.fn(async (_db: unknown, p: { amount: Prisma.Decimal }) => ({
    exchangeRate: new Prisma.Decimal('0.014'),
    baseCurrencyAmount: p.amount.mul('0.014'),
  })),
}));

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const TODAY = ymd(kabulDate(new Date()));
const NEXT_YEAR = ymd(new Date(kabulDate(new Date()).getTime() + 365 * 86400000));

function setup() {
  const written: { contract?: any; accountUpdate?: any; ledger?: any } = {};
  const tx: any = {
    contract: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ((written.contract = data), { id: 'c1', ...data })),
      findUniqueOrThrow: jest.fn(async () => ({ id: 'c1', ...written.contract })),
    },
    shop: { update: jest.fn(async () => ({})) },
    account: {
      update: jest.fn(async (args: any) => ((written.accountUpdate = args), { balance: new Prisma.Decimal(120000) })),
    },
    ledgerEntry: { create: jest.fn(async ({ data }: any) => ((written.ledger = data), data)) },
  };
  const prisma: any = {
    user: { findUnique: jest.fn(async () => ({ id: 'u1', role: 'ADMIN', marketId: 'mk' })) },
    shop: { findUnique: jest.fn(async () => ({ id: 's1', marketId: 'mk', shopNumber: '122' })) },
    tenant: { findUnique: jest.fn(async () => ({ id: 't1', marketId: 'mk' })) },
    currency: { findUnique: jest.fn(async () => ({ id: 'afn' })) },
    account: {
      findUnique: jest.fn(async () => ({ id: 'acc1', marketId: 'mk', currencyId: 'afn' })),
    },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const rentService: any = {
    generateChargesForContract: jest.fn(async () => undefined),
    recomputeRentDebt: jest.fn(async () => undefined),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const service = new ContractsService(prisma, rentService, {} as any, audit as any);
  return { service, prisma, tx, written, rentService };
}

const dto = (over: object = {}): any => ({
  shopId: 's1',
  tenantId: 't1',
  startDate: TODAY,
  endDate: NEXT_YEAR,
  rent: 5000,
  currencyId: 'afn',
  securityDeposit: 20000,
  ...over,
});
const user = { id: 'u1' };

describe('ContractsService.create — امانتِ قراردادِ قدیمی در برابرِ قراردادِ تازه', () => {
  it('قراردادِ قدیمی + isOpeningEntry=true: امانت روی قرارداد ثبت می‌شود، اما به هیچ حساب و دفتر کلی دست نمی‌خورد', async () => {
    const { service, tx, written } = setup();
    await service.create(
      user,
      dto({ startDate: '2026-03-01', securityDepositIsOpeningEntry: true }),
    );
    expect(written.contract.securityDeposit).toBe(20000);
    expect(written.contract.securityDepositRemaining).toBe(20000);
    expect(written.contract.securityDepositAccountId).toBeNull();
    expect(tx.account.update).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('قراردادِ قدیمی + بدونِ فلگ: ۴۰۰ و هیچ تراکنشی شروع نمی‌شود (جلوی دوبار شمرده شدن)', async () => {
    const { service, prisma, tx } = setup();
    const err = await service
      .create(user, dto({ startDate: '2026-03-01', securityDepositAccountId: 'acc1' }))
      .catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toContain('securityDepositIsOpeningEntry');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.account.update).not.toHaveBeenCalled();
  });

  it('قراردادِ قدیمی + isOpeningEntry=true + حساب: متناقض، رد می‌شود', async () => {
    const { service, prisma } = setup();
    await expect(
      service.create(
        user,
        dto({
          startDate: '2026-03-01',
          securityDepositIsOpeningEntry: true,
          securityDepositAccountId: 'acc1',
        }),
      ),
    ).rejects.toThrow(/به هیچ حسابی واریز نمی‌شود/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('قراردادِ تازه (شروع امروز) بدونِ فلگ: مثلِ قبل — امانت به حساب اضافه می‌شود و دفتر کل ردیفِ IN می‌خورد', async () => {
    const { service, tx, written } = setup();
    await service.create(user, dto({ securityDepositAccountId: 'acc1' }));
    expect(written.accountUpdate.data).toEqual({ balance: { increment: new Prisma.Decimal(20000) } });
    expect(written.ledger).toMatchObject({ accountId: 'acc1', direction: 'IN' });
    expect(written.ledger.amount.toString()).toBe('20000');
    expect(written.ledger.exchangeRate.toString()).toBe('0.014');
    expect(written.ledger.baseCurrencyAmount.toString()).toBe('280');
    expect(written.contract.securityDepositAccountId).toBe('acc1');
    expect(tx.account.update).toHaveBeenCalledTimes(1);
  });

  it('قراردادِ قدیمی + isOpeningEntry=false + حساب: انتخابِ صریحِ «همین الان دریافت شد» پول را به حساب می‌افزاید', async () => {
    const { service, tx } = setup();
    await service.create(
      user,
      dto({
        startDate: '2026-03-01',
        securityDepositIsOpeningEntry: false,
        securityDepositAccountId: 'acc1',
      }),
    );
    expect(tx.account.update).toHaveBeenCalledTimes(1);
    expect(tx.ledgerEntry.create).toHaveBeenCalledTimes(1);
  });

  it('قراردادِ قدیمی بدونِ امانت: هیچ محدودیتی اضافه نشده', async () => {
    const { service, written } = setup();
    await service.create(user, dto({ startDate: '2026-03-01', securityDeposit: undefined }));
    expect(written.contract.securityDeposit).toBe(0);
  });
});
