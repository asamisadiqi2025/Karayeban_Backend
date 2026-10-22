import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ContractsService } from './contracts.service';

jest.mock('../../common/utils/resolve-rate-to-base', () => ({
  resolveRateToBase: jest.fn(async (_db: unknown, p: { amount: Prisma.Decimal }) => ({
    exchangeRate: new Prisma.Decimal(1),
    baseCurrencyAmount: p.amount,
  })),
}));

const D = (v: number | string) => new Prisma.Decimal(v);
const meta = { ip: '127.0.0.1', userAgent: 'jest' };
const user = { id: 'u1' };

type Opts = {
  status?: string;
  deposit?: Prisma.Decimal;
  rentDebt?: Prisma.Decimal; // بعد از محاسبهٔ فسخ / سررسیدشده
  electricity?: { currencyId: string; amount: Prisma.Decimal; billsCount: number }[];
  accountCurrency?: string;
  accountDebitCount?: number;
  depositDebitCount?: number;
};

function setup(o: Opts = {}) {
  const contractRow = {
    id: 'c1',
    marketId: 'mk',
    shopId: 's1',
    tenantId: 't1',
    currencyId: 'afn',
    status: o.status ?? 'active',
    securityDepositRemaining: o.deposit ?? D(10000),
    endDate: new Date(Date.now() - 86400000), // تمام‌شده → تمدید مجاز
    rent: D(5000),
  };
  const tx: any = {
    $executeRaw: jest.fn(async () => 0),
    rentCharges: {
      findFirst: jest.fn(async () => null),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 0 })),
      aggregate: jest.fn(async () => ({ _sum: { remainingAmount: o.rentDebt ?? D(0) } })),
    },
    contract: {
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: o.depositDebitCount ?? 1 })),
      findUniqueOrThrow: jest.fn(async () => contractRow),
    },
    contractStatusHistory: { create: jest.fn(async () => ({})) },
    shop: { update: jest.fn(async () => ({})) },
    currency: { findMany: jest.fn(async () => [{ id: 'afn', code: 'AFN' }, { id: 'usd', code: 'USD' }]) },
    account: {
      updateMany: jest.fn(async () => ({ count: o.accountDebitCount ?? 1 })),
      findUniqueOrThrow: jest.fn(async () => ({ id: 'acc1', balance: D(7000) })),
    },
    ledgerEntry: { create: jest.fn(async ({ data }: any) => ({ id: 'led1', ...data })) },
  };
  const prisma: any = {
    user: { findUnique: jest.fn(async () => ({ id: 'u1', role: 'ADMIN', marketId: 'mk' })) },
    contract: { findUnique: jest.fn(async () => contractRow), findFirst: jest.fn(async () => null) },
    account: {
      findUnique: jest.fn(async () => ({
        id: 'acc1',
        marketId: 'mk',
        isActive: true,
        currencyId: o.accountCurrency ?? 'afn',
      })),
    },
    shop: { findUnique: jest.fn(async () => ({ shopNumber: '12' })) },
    currency: tx.currency,
    rentCharges: tx.rentCharges,
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const rentService: any = {
    recomputeRentDebt: jest.fn(async () => undefined),
    recordPayment: jest.fn(async (_tx: any, _a: any, p: any) => ({ id: 'rp1', amount: p.amount, source: p.source })),
  };
  const electricityService: any = {
    getOpenDebtByCurrencyForShop: jest.fn(async () => o.electricity ?? []),
    recordPayment: jest.fn(async (_tx: any, _a: any, p: any) => ({ id: 'ep1', amount: p.amount, source: p.source })),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const service = new ContractsService(prisma, rentService, electricityService, audit as any);
  return { service, prisma, tx, rentService, electricityService, audit };
}

const term = (over: object = {}): any => ({ terminationDate: new Date().toISOString().slice(0, 10), ...over });

describe('terminate — اول تسویه، بعد فسخ', () => {
  it('بدهیِ کرایه: ۴۰۹ با متنِ فارسیِ مبلغ‌ها و details ساختاریافته؛ هیچ تغییری نمی‌ماند', async () => {
    const { service } = setup({ rentDebt: D(4666.6667) });
    const err: any = await service.terminate(user, 'c1', term()).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    const body = err.getResponse();
    expect(body.message).toContain('فسخ قرارداد ممکن نیست');
    expect(body.message).toContain('کرایه 4666.6667 AFN');
    expect(body.message).toContain('pay-from-deposit');
    expect(body.message).toContain('pay-debt');
    expect(body.details).toMatchObject({
      code: 'OUTSTANDING_DEBT',
      action: 'terminate',
      rentDebt: '4666.6667',
      depositRemaining: '10000',
      rentCurrency: { code: 'AFN' },
    });
  });

  it('بدهیِ برق هم جلوی فسخ را می‌گیرد (به تفکیکِ ارز)', async () => {
    const { service } = setup({ electricity: [{ currencyId: 'afn', amount: D(650), billsCount: 1 }] });
    const err: any = await service.terminate(user, 'c1', term()).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse().message).toContain('برق 650 AFN');
    expect(err.getResponse().details.electricityDebt).toEqual([
      { currencyId: 'afn', currencyCode: 'AFN', amount: '650', billsCount: 1 },
    ]);
  });

  it('بدونِ بدهی: فسخ مثلِ قبل انجام می‌شود و audit بدونِ debtAtTermination است', async () => {
    const { service, audit } = setup();
    const res = await service.terminate(user, 'c1', term());
    expect(res).toBeDefined();
    const call = (audit.record as jest.Mock).mock.calls[0][0];
    expect(call.action).toBe('TERMINATE');
    expect(call.newData.debtAtTermination).toBeUndefined();
  });

  it('acknowledgeDebt بدونِ reason رد می‌شود (قبل از هر نوشتن)', async () => {
    const { service, prisma } = setup({ rentDebt: D(1000) });
    await expect(
      service.terminate(user, 'c1', term({ acknowledgeDebt: true })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('acknowledgeDebt + reason: با بدهیِ باز فسخ می‌شود و مبلغِ بدهی و دلیل در audit می‌ماند (بدهی بخشیده نمی‌شود)', async () => {
    const { service, audit, tx } = setup({
      rentDebt: D(1000),
      electricity: [{ currencyId: 'afn', amount: D(250), billsCount: 2 }],
    });
    await service.terminate(user, 'c1', term({ acknowledgeDebt: true, reason: 'مستأجر رفت و پرداخت نکرد' }));
    const call = (audit.record as jest.Mock).mock.calls[0][0];
    expect(call.reason).toBe('مستأجر رفت و پرداخت نکرد');
    expect(call.newData.debtAtTermination).toEqual({
      rent: '1000',
      electricity: [{ currencyId: 'afn', amount: '250' }],
    });
    // بدهی دست‌نخورده: هیچ write-off ای انجام نشده
    expect(tx.rentCharges.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ remainingAmount: D(0) }) }));
  });
});

describe('renew — تمدید فقط بدون بدهیِ سررسیدشده', () => {
  const renewDto: any = { newEndDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10) };

  it('کرایهٔ سررسیدشده: ۴۰۹ و قراردادِ قبلی expired نمی‌شود', async () => {
    const { service, tx } = setup({ rentDebt: D(5000) });
    const err: any = await service.renew(user, 'c1', renewDto).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse().message).toContain('تمدید قرارداد ممکن نیست');
    expect(err.getResponse().details.action).toBe('renew');
    expect(tx.contract.update).not.toHaveBeenCalled();
  });

  it('برقِ باز هم جلوی تمدید را می‌گیرد', async () => {
    const { service, tx } = setup({ electricity: [{ currencyId: 'afn', amount: D(100), billsCount: 1 }] });
    await expect(service.renew(user, 'c1', renewDto)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.contract.update).not.toHaveBeenCalled();
  });

  it('محافظ فقط فاکتورهای «سررسیدشده» را می‌شمارد (periodStart <= الان)', async () => {
    const { service, tx } = setup({ rentDebt: D(1) });
    await service.renew(user, 'c1', renewDto).catch(() => undefined);
    const where = tx.rentCharges.aggregate.mock.calls[0][0].where;
    expect(where.periodStart.lte).toBeInstanceOf(Date);
    expect(where.contractId).toBe('c1');
  });
});

describe('payFromDeposit — تسویه از امانت، کرایه و برق جدا و دستی', () => {
  it('کرایه و برق دو پرداختِ مستقل با source=SECURITY_DEPOSIT؛ امانتِ هر مرحله از مرحلهٔ قبل کم می‌شود', async () => {
    const { service, rentService, electricityService } = setup({
      deposit: D(10000),
      electricity: [{ currencyId: 'afn', amount: D(650), billsCount: 1 }],
    });
    const res: any = await service.payFromDeposit(user, 'c1', { rentAmount: 3000, electricityAmount: 650 }, meta);

    const rentCall = rentService.recordPayment.mock.calls[0][2];
    expect(rentCall.source).toBe('SECURITY_DEPOSIT');
    expect(rentCall.amount.toString()).toBe('3000');
    expect(rentCall.contract.securityDepositRemaining.toString()).toBe('10000');

    const elCall = electricityService.recordPayment.mock.calls[0][2];
    expect(elCall.source).toBe('SECURITY_DEPOSIT');
    expect(elCall.amount.toString()).toBe('650');
    expect(elCall.securityDeposit.remaining.toString()).toBe('7000'); // 10000 − 3000
    expect(res.depositRemaining.toString()).toBe('6350');
  });

  it('فقط کرایه: برق لمس نمی‌شود', async () => {
    const { service, electricityService } = setup();
    await service.payFromDeposit(user, 'c1', { rentAmount: 500 }, meta);
    expect(electricityService.recordPayment).not.toHaveBeenCalled();
  });

  it('امانت کافی نیست: ۴۰۹ با راهنمایی به pay-debt و هیچ پرداختی ثبت نمی‌شود', async () => {
    const { service, rentService } = setup({ deposit: D(1000) });
    const err: any = await service
      .payFromDeposit(user, 'c1', { rentAmount: 800, electricityAmount: 300 }, meta)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toContain('pay-debt');
    expect(rentService.recordPayment).not.toHaveBeenCalled();
  });

  it('برقِ ارزِ دیگر با امانت پوشیده نمی‌شود (۴۰۰)', async () => {
    const { service } = setup({ electricity: [{ currencyId: 'usd', amount: D(10), billsCount: 1 }] });
    await expect(
      service.payFromDeposit(user, 'c1', { electricityAmount: 10 }, meta),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('هیچ مبلغی ندادن، و قراردادِ draft/cancelled رد می‌شود', async () => {
    await expect(setup().service.payFromDeposit(user, 'c1', {}, meta)).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      setup({ status: 'cancelled' }).service.payFromDeposit(user, 'c1', { rentAmount: 1 }, meta),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('refundDeposit — برگرداندنِ باقی‌ماندهٔ امانت', () => {
  const ok = { accountId: 'acc1' } as any;

  it('قراردادِ جاری (active) امانتش را پس نمی‌دهد', async () => {
    await expect(setup({ status: 'active' }).service.refundDeposit(user, 'c1', ok, meta)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('تا بدهیِ باز هست امانت پس داده نمی‌شود (کرایه یا برق)', async () => {
    const a = setup({ status: 'early_terminated', rentDebt: D(100) });
    const err: any = await a.service.refundDeposit(user, 'c1', ok, meta).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse().details.action).toBe('refund-deposit');
    expect(a.tx.account.updateMany).not.toHaveBeenCalled();

    const b = setup({ status: 'expired', electricity: [{ currencyId: 'afn', amount: D(5), billsCount: 1 }] });
    await expect(b.service.refundDeposit(user, 'c1', ok, meta)).rejects.toBeInstanceOf(ConflictException);
  });

  it('کلِ باقی‌مانده: موجودیِ حساب کم، امانت کم، ledger OUT و audit', async () => {
    const { service, tx, audit } = setup({ status: 'early_terminated', deposit: D(4000) });
    const res: any = await service.refundDeposit(user, 'c1', ok, meta);

    expect(tx.account.updateMany).toHaveBeenCalledWith({
      where: { id: 'acc1', balance: { gte: D(4000) } },
      data: { balance: { decrement: D(4000) } },
    });
    expect(tx.contract.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', securityDepositRemaining: { gte: D(4000) } },
      data: { securityDepositRemaining: { decrement: D(4000) } },
    });
    const led = tx.ledgerEntry.create.mock.calls[0][0].data;
    expect(led).toMatchObject({ direction: 'OUT', accountId: 'acc1', currencyId: 'afn', balanceAfter: D(7000) });
    expect(led.amount.toString()).toBe('4000');
    expect(res.refundedAmount.toString()).toBe('4000');
    expect(res.depositRemaining.toString()).toBe('0');
    expect((audit.record as jest.Mock).mock.calls[0][0]).toMatchObject({ entityType: 'Contract', action: 'UPDATE' });
  });

  it('بخشی از امانت: باقی‌مانده می‌ماند؛ بیشتر از باقی‌مانده رد می‌شود', async () => {
    const part = setup({ status: 'expired', deposit: D(4000) });
    const res: any = await part.service.refundDeposit(user, 'c1', { ...ok, amount: 1500 }, meta);
    expect(res.depositRemaining.toString()).toBe('2500');

    const over = setup({ status: 'expired', deposit: D(4000) });
    await expect(over.service.refundDeposit(user, 'c1', { ...ok, amount: 4001 }, meta)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('امانتِ صفر (مثلاً به تمدید منتقل شده): ۴۰۹', async () => {
    await expect(
      setup({ status: 'expired', deposit: D(0) }).service.refundDeposit(user, 'c1', ok, meta),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('حسابِ هم‌ارزِ قرارداد لازم است؛ موجودیِ ناکافیِ حساب ۴۰۹ می‌دهد و ledger نمی‌نویسد', async () => {
    await expect(
      setup({ status: 'expired', accountCurrency: 'usd' }).service.refundDeposit(user, 'c1', ok, meta),
    ).rejects.toBeInstanceOf(BadRequestException);

    const poor = setup({ status: 'expired', accountDebitCount: 0 });
    await expect(poor.service.refundDeposit(user, 'c1', ok, meta)).rejects.toBeInstanceOf(ConflictException);
    expect(poor.tx.ledgerEntry.create).not.toHaveBeenCalled();
  });
});

describe('getSettlementSummary', () => {
  it('بدهیِ سررسیدشده در برابرِ امانت: کفایت، باقیِ امانت و کسری برای پرداختِ نقد', async () => {
    const enough = setup({
      deposit: D(10000),
      rentDebt: D(6000),
      electricity: [{ currencyId: 'afn', amount: D(1000), billsCount: 2 }],
    });
    const a: any = await enough.service.getSettlementSummary(user, 'c1');
    expect(a.dueDebtCoverableByDeposit.toString()).toBe('7000');
    expect(a.depositCoversDueDebt).toBe(true);
    expect(a.depositLeftAfterDebt.toString()).toBe('3000');
    expect(a.shortfallToPayInCash.toString()).toBe('0');

    const short = setup({ deposit: D(5000), rentDebt: D(6000) });
    const b: any = await short.service.getSettlementSummary(user, 'c1');
    expect(b.depositCoversDueDebt).toBe(false);
    expect(b.shortfallToPayInCash.toString()).toBe('1000');
    expect(b.depositLeftAfterDebt.toString()).toBe('0');
  });

  it('برقِ ارزِ دیگر جدا گزارش می‌شود و در «قابل‌پوشش با امانت» نمی‌آید', async () => {
    const { service } = setup({
      deposit: D(1000),
      rentDebt: D(100),
      electricity: [{ currencyId: 'usd', amount: D(20), billsCount: 1 }],
    });
    const s: any = await service.getSettlementSummary(user, 'c1');
    expect(s.dueDebtCoverableByDeposit.toString()).toBe('100');
    expect(s.electricityInOtherCurrency).toEqual([{ currencyId: 'usd', currencyCode: 'USD', amount: D(20) }]);
  });
});
