import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ContractsService } from '../contracts/contracts.service';
import { DebtPromisesService } from './debt-promises.service';
import { canAllowDebt } from './debt-allow';
import {
  createDebtPromise,
  describePromise,
  parsePromisedDate,
  refreshDebtPromisesForTenant,
} from './debt-promise.util';

const D = (v: number | string) => new Prisma.Decimal(v);
const meta = { ip: '127.0.0.1', userAgent: 'jest' };
const DAY = 86_400_000;
const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const midnight = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('parsePromisedDate — تاریخِ قولِ پرداخت', () => {
  it('خالی/نامعتبر/گذشته رد می‌شود؛ امروز و آینده قبول', () => {
    expect(() => parsePromisedDate(undefined)).toThrow(BadRequestException);
    expect(() => parsePromisedDate('   ')).toThrow(BadRequestException);
    expect(() => parsePromisedDate('not-a-date')).toThrow(BadRequestException);
    expect(() => parsePromisedDate('2000-01-01')).toThrow(BadRequestException);
    expect(parsePromisedDate('2099-12-31T10:20:30.000Z').toISOString()).toBe('2099-12-31T00:00:00.000Z');
  });

  it('«امروز به وقتِ کابل» مجاز است حتی اگر ساعتِ UTC هنوز دیروز باشد', () => {
    // ۲۲ اکتبر ساعتِ ۰۳:۰۰ به وقتِ کابل = ۲۱ اکتبر ۲۲:۳۰ UTC
    const now = new Date('2026-10-21T22:30:00.000Z');
    expect(parsePromisedDate('2026-10-22', now).toISOString()).toBe('2026-10-22T00:00:00.000Z');
    expect(() => parsePromisedDate('2026-10-21', now)).toThrow(BadRequestException);
  });
});

describe('canAllowDebt — اجازهٔ فسخ/تمدید با بدهی', () => {
  it('ادمین و سوپرادمین همیشه؛ حسابدار فقط با کلیدِ contracts.allow_debt', () => {
    expect(canAllowDebt({ role: 'ADMIN' })).toBe(true);
    expect(canAllowDebt({ role: 'SUPER_ADMIN', grantedPermissions: [] })).toBe(true);
    expect(canAllowDebt({ role: 'ACCOUNTANT', grantedPermissions: null })).toBe(false);
    expect(canAllowDebt({ role: 'ACCOUNTANT', grantedPermissions: ['contracts.terminate'] })).toBe(false);
    expect(canAllowDebt({ role: 'ACCOUNTANT', grantedPermissions: ['contracts.allow_debt'] })).toBe(true);
  });
});

// ───────────────────────── توابعِ tx ─────────────────────────

function txFor(o: {
  open?: any[]; // تعهدهای بازِ قبلیِ مستأجر
  rentOpen?: { id: string; currencyId?: string; remainingAmount: Prisma.Decimal }[]; // فاکتورهای هنوز-باز
  billsOpen?: { id: string; currencyId?: string; remainingAmount: Prisma.Decimal }[];
}) {
  const open = (rows: any[] | undefined, ids: string[]) =>
    (rows ?? []).filter((r) => ids.includes(r.id)).map((r) => ({ currencyId: 'afn', ...r }));
  return {
    $executeRaw: jest.fn(async () => 0),
    debtPromise: {
      findMany: jest.fn(async () => o.open ?? []),
      update: jest.fn(async () => ({})),
      create: jest.fn(async ({ data }: any) => ({ id: 'new1', ...data })),
    },
    rentCharges: {
      findMany: jest.fn(async ({ where }: any) => open(o.rentOpen, where.id?.in ?? [])),
    },
    electricityBill: {
      findMany: jest.fn(async ({ where }: any) => open(o.billsOpen, where.id?.in ?? [])),
    },
    currency: { findMany: jest.fn(async () => [{ id: 'afn', code: 'AFN' }]) },
  } as any;
}

describe('createDebtPromise — یک تعهدِ بازِ فعال برای هر مستأجر', () => {
  it('تعهدِ بازِ قبلی بسته می‌شود و فاکتورهای هنوز-بازِ آن به تعهدِ تازه می‌پیوندد', async () => {
    const tx = txFor({
      open: [{ id: 'old1', rentChargeIds: ['r-old', 'r-paid'], electricityBillIds: ['b-old'] }],
      rentOpen: [{ id: 'r-old', remainingAmount: D(500) }], // r-paid دیگر باز نیست
      billsOpen: [{ id: 'b-old', remainingAmount: D(120) }],
    });
    const res = await createDebtPromise(tx, {
      marketId: 'mk',
      tenantId: 't1',
      contractId: 'c1',
      source: 'TERMINATE',
      promisedDate: midnight('2099-01-10'),
      reason: ' رفت ',
      createdById: 'u1',
      items: { rent: [{ id: 'r-new', currencyId: 'afn', remaining: D(1000) }], bills: [] },
    });

    expect(tx.$executeRaw).toHaveBeenCalled(); // قفلِ مشورتی
    expect(tx.debtPromise.update).toHaveBeenCalledWith({
      where: { id: 'old1' },
      data: expect.objectContaining({ status: 'CANCELLED' }),
    });
    const data = tx.debtPromise.create.mock.calls[0][0].data;
    expect(data.rentChargeIds.sort()).toEqual(['r-new', 'r-old']);
    expect(data.electricityBillIds).toEqual(['b-old']);
    expect(data.reason).toBe('رفت');
    expect(res.supersededIds).toEqual(['old1']);
    // عکسِ بدهی: کرایه 1500 (1000 + 500) و برق 120 به ارزِ AFN
    expect(res.snapshot).toEqual([
      { kind: 'RENT', currencyId: 'afn', currencyCode: 'AFN', amount: '1500' },
      { kind: 'ELECTRICITY', currencyId: 'afn', currencyCode: 'AFN', amount: '120' },
    ]);
  });

  it('بدونِ تعهدِ قبلی فقط همین فاکتورها', async () => {
    const tx = txFor({});
    await createDebtPromise(tx, {
      marketId: 'mk',
      tenantId: 't1',
      source: 'MANUAL',
      promisedDate: midnight('2099-01-10'),
      reason: 'x',
      createdById: null,
      items: { rent: [{ id: 'r1', currencyId: 'afn', remaining: D(10) }], bills: [] },
    });
    expect(tx.debtPromise.update).not.toHaveBeenCalled();
    expect(tx.debtPromise.create.mock.calls[0][0].data.rentChargeIds).toEqual(['r1']);
  });
});

describe('refreshDebtPromisesForTenant — بسته‌شدنِ خودکار', () => {
  it('تا یک فاکتور باز است تعهد باز می‌ماند؛ وقتی همه صفر شد FULFILLED', async () => {
    const stillOpen = txFor({
      open: [{ id: 'p1', rentChargeIds: ['r1', 'r2'], electricityBillIds: [] }],
      rentOpen: [{ id: 'r2', remainingAmount: D(1) }],
    });
    await refreshDebtPromisesForTenant(stillOpen, 't1');
    expect(stillOpen.debtPromise.update).not.toHaveBeenCalled();

    const allPaid = txFor({ open: [{ id: 'p1', rentChargeIds: ['r1'], electricityBillIds: ['b1'] }] });
    await refreshDebtPromisesForTenant(allPaid, 't1');
    expect(allPaid.debtPromise.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({ status: 'FULFILLED' }),
    });
  });

  it('وقتی تعهدِ بازی نیست هیچ نمی‌نویسد', async () => {
    const tx = txFor({ open: [] });
    await refreshDebtPromisesForTenant(tx, 't1');
    expect(tx.debtPromise.update).not.toHaveBeenCalled();
    expect(tx.rentCharges.findMany).not.toHaveBeenCalled();
  });
});

describe('describePromise — عقب‌افتاده بودن', () => {
  const now = new Date('2026-10-22T08:00:00.000Z');
  const base = { status: 'OPEN' as const, rentChargeIds: ['r1'], electricityBillIds: [] as string[] };
  const withDebt = () => txFor({ rentOpen: [{ id: 'r1', remainingAmount: D(300) }] });

  it('تاریخِ وعده گذشته و هنوز بدهی مانده = عقب‌افتاده با تعدادِ روز', async () => {
    const v = await describePromise(withDebt(), { ...base, promisedDate: midnight('2026-10-19') }, now);
    expect(v.isOverdue).toBe(true);
    expect(v.daysOverdue).toBe(3);
    expect(v.remaining).toEqual([{ kind: 'RENT', currencyId: 'afn', currencyCode: 'AFN', amount: '300' }]);
  });

  it('روزِ وعده هنوز تمام نشده / بدهی صفر / تعهدِ بسته: عقب‌افتاده نیست', async () => {
    expect((await describePromise(withDebt(), { ...base, promisedDate: midnight('2026-10-22') }, now)).isOverdue).toBe(false);
    expect((await describePromise(txFor({}), { ...base, promisedDate: midnight('2026-10-01') }, now)).isOverdue).toBe(false);
    const closed = await describePromise(withDebt(), { ...base, status: 'FULFILLED', promisedDate: midnight('2026-10-01') }, now);
    expect(closed.isOverdue).toBe(false);
    expect(closed.remaining).toEqual([]);
  });
});

// ───────────────────────── فسخ/تمدید با بدهی (ContractsService) ─────────────────────────

type Opts = { rentDebt?: Prisma.Decimal; role?: string; granted?: unknown; status?: string };

function setup(o: Opts = {}) {
  const contractRow = {
    id: 'c1',
    marketId: 'mk',
    shopId: 's1',
    tenantId: 't1',
    currencyId: 'afn',
    status: o.status ?? 'active',
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
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () =>
        o.rentDebt && o.rentDebt.greaterThan(0) ? [{ id: 'rc1', currencyId: 'afn', remainingAmount: o.rentDebt }] : [],
      ),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 0 })),
      aggregate: jest.fn(async () => ({ _sum: { remainingAmount: o.rentDebt ?? D(0) } })),
    },
    electricityBill: { findMany: jest.fn(async () => []) },
    contract: {
      update: jest.fn(async () => ({})),
      create: jest.fn(async () => ({ id: 'c2' })),
      findUniqueOrThrow: jest.fn(async () => contractRow),
    },
    contractStatusHistory: { create: jest.fn(async () => ({})) },
    shop: { update: jest.fn(async () => ({})) },
    currency: { findMany: jest.fn(async () => [{ id: 'afn', code: 'AFN' }]) },
    debtPromise: {
      findMany: jest.fn(async () => []),
      update: jest.fn(async () => ({})),
      create: jest.fn(async ({ data }: any) => ({ id: 'dp1', ...data })),
    },
  };
  const prisma: any = {
    user: {
      findUnique: jest.fn(async () => ({
        id: 'u1',
        role: o.role ?? 'ADMIN',
        marketId: 'mk',
        grantedPermissions: o.granted ?? null,
      })),
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
  return { service, prisma, tx, audit, rentService };
}

const user = { id: 'u1' };
const term = (over: object = {}): any => ({ terminationDate: isoDay(0), ...over });
const renewDto = (over: object = {}): any => ({ newEndDate: isoDay(365), ...over });

describe('فسخ با بدهی — اجازه + دلیل + تاریخِ قول', () => {
  it('acknowledgeDebt بدونِ تاریخِ قول رد می‌شود (قبل از هر نوشتن)', async () => {
    const { service, prisma } = setup({ rentDebt: D(1000) });
    await expect(
      service.terminate(user, 'c1', term({ acknowledgeDebt: true, reason: 'رفت' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('تاریخِ قولِ گذشته رد می‌شود', async () => {
    const { service } = setup({ rentDebt: D(1000) });
    await expect(
      service.terminate(user, 'c1', term({ acknowledgeDebt: true, reason: 'رفت', promisedPaymentDate: isoDay(-3) })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('حسابدارِ بدونِ دسترسیِ contracts.allow_debt: ۴۰۳؛ با دسترسی: قبول و تعهد ساخته می‌شود', async () => {
    const denied = setup({ rentDebt: D(1000), role: 'ACCOUNTANT', granted: ['contracts.terminate'] });
    await expect(
      denied.service.terminate(user, 'c1', term({ acknowledgeDebt: true, reason: 'رفت', promisedPaymentDate: isoDay(5) })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(denied.prisma.$transaction).not.toHaveBeenCalled();

    const allowed = setup({ rentDebt: D(1000), role: 'ACCOUNTANT', granted: ['contracts.terminate', 'contracts.allow_debt'] });
    await allowed.service.terminate(
      user,
      'c1',
      term({ acknowledgeDebt: true, reason: 'رفت', promisedPaymentDate: isoDay(5) }),
    );
    expect(allowed.tx.debtPromise.create).toHaveBeenCalledTimes(1);
  });

  it('تعهد: تاریخ، دلیل، فاکتورِ باز و شناسهٔ تعهد در audit؛ بدهی بخشیده نمی‌شود', async () => {
    const { service, tx, audit } = setup({ rentDebt: D(1000) });
    const promised = isoDay(9);
    await service.terminate(user, 'c1', term({ acknowledgeDebt: true, reason: 'پول ندارد', promisedPaymentDate: promised }));
    const data = tx.debtPromise.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: 't1', contractId: 'c1', source: 'TERMINATE', reason: 'پول ندارد', createdById: 'u1' });
    expect(data.promisedDate.toISOString().slice(0, 10)).toBe(promised);
    expect(data.rentChargeIds).toEqual(['rc1']);
    expect(data.snapshot).toEqual([{ kind: 'RENT', currencyId: 'afn', currencyCode: 'AFN', amount: '1000' }]);
    const call = (audit.record as jest.Mock).mock.calls[0][0];
    expect(call.newData.debtPromise).toMatchObject({ id: 'dp1' });
    expect(tx.rentCharges.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ remainingAmount: D(0) }) }),
    );
  });

  it('acknowledgeDebt ولی بدهی نیست: تعهدی ساخته نمی‌شود', async () => {
    const { service, tx } = setup();
    await service.terminate(user, 'c1', term({ acknowledgeDebt: true, reason: 'ok', promisedPaymentDate: isoDay(2) }));
    expect(tx.debtPromise.create).not.toHaveBeenCalled();
  });

  it('بدونِ acknowledgeDebt هنوز ۴۰۹ است و پیامش راهِ دوم (acknowledgeDebt) را می‌گوید', async () => {
    const { service } = setup({ rentDebt: D(700) });
    const err: any = await service.terminate(user, 'c1', term()).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse().message).toContain('acknowledgeDebt');
    expect(err.getResponse().details.acknowledgeDebtPossible).toBe(true);
  });
});

describe('تمدید با بدهی — همان قاعده', () => {
  it('بدونِ acknowledgeDebt: ۴۰۹ و قراردادِ قبلی expired نمی‌شود', async () => {
    const { service, tx } = setup({ rentDebt: D(5000) });
    const err: any = await service.renew(user, 'c1', renewDto()).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse().details.action).toBe('renew');
    expect(tx.contract.update).not.toHaveBeenCalled();
  });

  it('acknowledgeDebt بدونِ دلیل یا بدونِ تاریخِ قول رد می‌شود', async () => {
    const { service, prisma } = setup({ rentDebt: D(5000) });
    await expect(
      service.renew(user, 'c1', renewDto({ acknowledgeDebt: true, promisedPaymentDate: isoDay(5) })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.renew(user, 'c1', renewDto({ acknowledgeDebt: true, reason: 'پول کامل ندارد' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('با اجازه + دلیل + تاریخ: تمدید می‌شود، قراردادِ قبلی expired، بدهی روی همان قرارداد می‌ماند و تعهد ساخته می‌شود', async () => {
    const { service, tx, audit } = setup({ rentDebt: D(5000) });
    const promised = isoDay(12);
    await service.renew(
      user,
      'c1',
      renewDto({ acknowledgeDebt: true, reason: 'پول کامل ندارد', promisedPaymentDate: promised }),
    );
    expect(tx.contract.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1' }, data: expect.objectContaining({ status: 'expired' }) }),
    );
    expect(tx.contract.create).toHaveBeenCalled();
    const data = tx.debtPromise.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ source: 'RENEW', contractId: 'c1', tenantId: 't1', reason: 'پول کامل ندارد' });
    expect(data.rentChargeIds).toEqual(['rc1']);
    expect(data.promisedDate.toISOString().slice(0, 10)).toBe(promised);
    const call = (audit.record as jest.Mock).mock.calls.find((c: any[]) => c[0].action === 'RENEW')![0];
    expect(call.reason).toBe('پول کامل ندارد');
    expect(call.newData.debtPromise).toMatchObject({ id: 'dp1' });
  });

  it('تمدیدِ بدونِ بدهی مثلِ قبل است و تعهدی نمی‌سازد', async () => {
    const { service, tx } = setup();
    await service.renew(user, 'c1', renewDto());
    expect(tx.debtPromise.create).not.toHaveBeenCalled();
  });
});

// ───────────────────────── فهرستِ پیگیری و مدیریتِ تعهد ─────────────────────────

function svcSetup(o: { status?: string; remaining?: boolean } = {}) {
  const promiseRow = {
    id: 'p1',
    marketId: 'mk',
    tenantId: 't1',
    contractId: 'c1',
    source: 'TERMINATE',
    status: o.status ?? 'OPEN',
    promisedDate: midnight('2026-10-01'),
    reason: 'x',
    rentChargeIds: ['r1'],
    electricityBillIds: [],
    snapshot: [],
    rescheduleCount: 0,
    tenant: { id: 't1', fullName: 'علی', contact: null },
    contract: { id: 'c1', status: 'early_terminated', shop: { shopNumber: '101' }, guarantor: { id: 'g1', name: 'ضامن', contact: '070' } },
    createdBy: { id: 'u1', fullName: 'ادمین' },
  };
  const tx: any = {
    $executeRaw: jest.fn(async () => 0),
    debtPromise: {
      findMany: jest.fn(async () => []),
      update: jest.fn(async ({ data }: any) => ({ ...promiseRow, ...data })),
      create: jest.fn(async ({ data }: any) => ({ id: 'new1', ...data })),
    },
    rentCharges: { findMany: jest.fn(async () => (o.remaining === false ? [] : [{ id: 'r1', currencyId: 'afn', remainingAmount: D(400) }])) },
    electricityBill: { findMany: jest.fn(async () => []) },
    currency: { findMany: jest.fn(async () => [{ id: 'afn', code: 'AFN' }]) },
  };
  const prisma: any = {
    user: { findUnique: jest.fn(async () => ({ id: 'u1', role: 'ADMIN', marketId: 'mk' })) },
    tenant: { findUnique: jest.fn(async () => ({ id: 't1', marketId: 'mk' })) },
    debtPromise: {
      findUnique: jest.fn(async () => promiseRow),
      findUniqueOrThrow: jest.fn(async () => promiseRow),
      findMany: jest.fn(async () => [promiseRow]),
      count: jest.fn(async () => 1),
    },
    rentCharges: tx.rentCharges,
    electricityBill: tx.electricityBill,
    currency: tx.currency,
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const audit = { record: jest.fn(async () => undefined) };
  return { service: new DebtPromisesService(prisma, audit as any), prisma, tx, audit };
}

describe('DebtPromisesService — فهرستِ پیگیری', () => {
  it('پیش‌فرض فقط تعهدهای باز؛ ?overdue=true فقط عقب‌افتاده‌ها (باز + تاریخِ گذشته)', async () => {
    const a = svcSetup();
    await a.service.findAll(user, {} as any);
    expect(a.prisma.debtPromise.findMany.mock.calls[0][0].where).toMatchObject({ marketId: 'mk', status: 'OPEN' });

    const b = svcSetup();
    await b.service.findAll(user, { overdue: true } as any);
    const where = b.prisma.debtPromise.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('OPEN');
    expect(where.promisedDate.lt).toBeInstanceOf(Date);
  });

  it('هر ردیف: مستأجر، دوکان، ضامن، باقی‌ماندهٔ زنده و عقب‌افتاده بودن', async () => {
    const { service } = svcSetup();
    const res: any = await service.findAll(user, {} as any);
    const row = res.data[0];
    expect(row.tenant.fullName).toBe('علی');
    expect(row.contract.shopNumber).toBe('101');
    expect(row.guarantor).toMatchObject({ name: 'ضامن' });
    expect(row.remaining).toEqual([{ kind: 'RENT', currencyId: 'afn', currencyCode: 'AFN', amount: '400' }]);
    expect(row.isOverdue).toBe(true);
    expect(row.daysOverdue).toBeGreaterThan(0);
  });

  it('?dueWithinDays: فقط وعده‌های باز در بازهٔ امروز تا N روز بعد', async () => {
    const { service, prisma } = svcSetup();
    await service.findAll(user, { dueWithinDays: 7 } as any);
    const where = prisma.debtPromise.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('OPEN');
    expect(where.promisedDate.gte).toBeInstanceOf(Date);
    expect(where.promisedDate.lte.getTime() - where.promisedDate.gte.getTime()).toBe(7 * DAY);
  });
});

describe('DebtPromisesService — ثبتِ دستی، عقب‌انداختن، لغو', () => {
  it('ثبتِ دستی برای مستأجرِ بی‌بدهی رد می‌شود', async () => {
    const { service, tx } = svcSetup({ remaining: false });
    tx.rentCharges.findMany = jest.fn(async () => []);
    await expect(
      service.create(user, { tenantId: 't1', promisedDate: isoDay(3), reason: 'x' }, meta),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ثبتِ دستی: همهٔ کرایهٔ سررسیدشده + برقِ بازِ مستأجر، با audit', async () => {
    const { service, tx, audit } = svcSetup();
    await service.create(user, { tenantId: 't1', promisedDate: isoDay(3), reason: 'می‌دهد' }, meta);
    const data = tx.debtPromise.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ source: 'MANUAL', tenantId: 't1', createdById: 'u1' });
    expect(tx.rentCharges.findMany.mock.calls[0][0].where.contractId).toBeUndefined();
    expect((audit.record as jest.Mock).mock.calls[0][0]).toMatchObject({ entityType: 'DebtPromise', action: 'CREATE' });
  });

  it('عقب‌انداختنِ تاریخ: فقط تعهدِ باز؛ تعدادِ عقب‌انداختن بالا می‌رود و دلیل در audit می‌ماند', async () => {
    const closed = svcSetup({ status: 'FULFILLED' });
    await expect(closed.service.reschedule(user, 'p1', { promisedDate: isoDay(4), reason: 'x' }, meta)).rejects.toBeInstanceOf(
      ConflictException,
    );

    const ok = svcSetup();
    await ok.service.reschedule(user, 'p1', { promisedDate: isoDay(4), reason: 'پول نرسید' }, meta);
    expect(ok.tx.debtPromise.update.mock.calls[0][0].data.rescheduleCount).toEqual({ increment: 1 });
    expect((ok.audit.record as jest.Mock).mock.calls[0][0].reason).toBe('پول نرسید');
    await expect(
      ok.service.reschedule(user, 'p1', { promisedDate: isoDay(-2), reason: 'x' }, meta),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('لغو: فقط تعهدِ باز؛ دلیل ثبت می‌شود', async () => {
    const closed = svcSetup({ status: 'CANCELLED' });
    await expect(closed.service.cancel(user, 'p1', { reason: 'x' }, meta)).rejects.toBeInstanceOf(ConflictException);

    const ok = svcSetup();
    await ok.service.cancel(user, 'p1', { reason: 'اشتباه ثبت شد' }, meta);
    expect(ok.tx.debtPromise.update.mock.calls[0][0].data).toMatchObject({ status: 'CANCELLED', cancelReason: 'اشتباه ثبت شد' });
  });

  it('کاربرِ بازارِ دیگر به تعهد دسترسی ندارد', async () => {
    const { service, prisma } = svcSetup();
    prisma.user.findUnique = jest.fn(async () => ({ id: 'u9', role: 'ADMIN', marketId: 'other' }));
    await expect(service.findOne({ id: 'u9' }, 'p1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
