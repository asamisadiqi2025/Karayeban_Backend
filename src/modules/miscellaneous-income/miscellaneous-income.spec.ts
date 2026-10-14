import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MiscellaneousIncomeService } from './miscellaneous-income.service';
import { nameKey } from '../../common/utils/category-name';

jest.mock('../../common/utils/ensure-market-setup-complete', () => ({
  ensureMarketSetupComplete: jest.fn(async () => undefined),
}));
jest.mock('../../common/utils/ensure-currency-enabled-for-market', () => ({
  ensureCurrencyEnabledForMarket: jest.fn(async () => undefined),
}));
jest.mock('../../common/utils/resolve-rate-to-base', () => ({
  resolveRateToBase: jest.fn(async (_db: unknown, p: { amount: Prisma.Decimal }) => ({
    exchangeRate: new Prisma.Decimal(1),
    baseCurrencyAmount: p.amount,
  })),
}));

const D = (v: number | string) => new Prisma.Decimal(v);
const meta = { ip: '127.0.0.1', userAgent: 'jest' };
const user = { id: 'u1' };

// تابلو (مادرِ دارای زیرشاخه) ← تابلو ۱۲ (سب‌کتگوری)؛ جریمه (مادرِ بدونِ زیرشاخه)؛ مارکت دیگر
const cat = (id: string, name: string, parentId: string | null, over: object = {}) => ({
  id,
  name,
  parentId,
  marketId: 'mk1',
  isActive: true,
  parent: null as null | { name: string; isActive: boolean },
  ...over,
});
const CATS: Record<string, ReturnType<typeof cat>> = {
  sign: cat('sign', 'اجاره تابلو', null),
  sign12: cat('sign12', 'تابلو ۱۲', 'sign', { parent: { name: 'اجاره تابلو', isActive: true } }),
  fine: cat('fine', 'جریمه', null),
  off: cat('off', 'غیرفعال', null, { isActive: false }),
  other: cat('other', 'مارکت دیگر', null, { marketId: 'mk2' }),
};

function setup(
  opts: {
    activeChildren?: Record<string, boolean>;
    accountBalance?: number;
    debitCount?: number;
    existingIncome?: Partial<{ amount: Prisma.Decimal; accountId: string; currencyId: string }>;
    hasLedger?: boolean;
    clashingSibling?: { id: string; name: string } | null;
    createThrows?: unknown;
  } = {},
) {
  const activeChildren = opts.activeChildren ?? { sign: true, fine: false };
  const created: any[] = [];
  const ledger: any[] = [];
  const createdCats: any[] = [];

  const tx = {
    miscellaneousIncomeCategory: {
      findUnique: jest.fn(async () => opts.clashingSibling ?? null),
      upsert: jest.fn(async (args: any) => {
        const sub = { id: 'new-sub', isActive: true, ...args.create };
        createdCats.push(sub);
        return sub;
      }),
      create: jest.fn(async (args: any) => {
        if (opts.createThrows) throw opts.createThrows;
        const row = { id: `cat-${createdCats.length + 1}`, isActive: true, ...args.data };
        createdCats.push(row);
        return row;
      }),
      update: jest.fn(async (args: any) => ({ id: args.where.id, ...args.data })),
    },
    account: {
      update: jest.fn(async () => ({ id: 'acc1', balance: D(5100) })),
      updateMany: jest.fn(async () => ({ count: opts.debitCount ?? 1 })),
      findUniqueOrThrow: jest.fn(async () => ({ id: 'acc1', balance: D(opts.accountBalance ?? 4000) })),
    },
    miscellaneousIncome: {
      create: jest.fn(async (args: any) => {
        created.push(args.data);
        return { id: 'inc-new', ...args.data };
      }),
      update: jest.fn(async (args: any) => ({ id: 'inc1', date: new Date('2026-10-01'), ...args.data })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      deleteMany: jest.fn(async () => ({ count: 1 })),
      findUniqueOrThrow: jest.fn(async () => ({ id: 'inc1', date: new Date('2026-10-01'), description: null })),
    },
    ledgerEntry: {
      create: jest.fn(async (args: any) => {
        ledger.push(args.data);
        return {};
      }),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUnique: jest.fn(async () => (opts.hasLedger === false ? null : { id: 'led1' })),
    },
  };

  // دسته‌های خوانده‌شده از prisma (بیرونِ تراکنش) — با include.parent مثلِ findUnique واقعی
  const prisma: any = {
    user: { findUnique: jest.fn(async () => ({ id: 'u1', role: 'ACCOUNTANT', marketId: 'mk1' })) },
    miscellaneousIncomeCategory: {
      findUnique: jest.fn(async (args: any) => {
        if (args.where.scopeKey_nameKey) return opts.clashingSibling ?? null;
        return CATS[args.where.id] ?? null;
      }),
      findFirst: jest.fn(async ({ where }: any) =>
        activeChildren[where.parentId] ? { id: 'child' } : null,
      ),
    },
    account: {
      findUnique: jest.fn(async () => ({
        id: 'acc1',
        marketId: 'mk1',
        currencyId: 'afn',
        isActive: true,
      })),
    },
    miscellaneousIncome: {
      findUnique: jest.fn(async () => ({
        id: 'inc1',
        marketId: 'mk1',
        categoryId: 'fine',
        rootCategoryId: 'fine',
        accountId: 'acc1',
        currencyId: 'afn',
        amount: D(1000),
        exchangeRate: D(1),
        baseCurrencyAmount: D(1000),
        date: new Date('2026-10-01T00:00:00Z'),
        description: 'قدیمی',
        ...opts.existingIncome,
      })),
    },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const service = new MiscellaneousIncomeService(prisma, audit as any);
  return { service, prisma, tx, audit, created, ledger, createdCats };
}

const incomeDto = (categoryId: string, extra: object = {}) =>
  ({ categoryId, accountId: 'acc1', amount: 100, ...extra }) as any;

describe('createIncome — جریانِ پول برعکسِ مصارف است', () => {
  it('موجودیِ حساب «زیاد» می‌شود (increment) و ledger از نوع IN با balanceAfter است', async () => {
    const { service, tx, ledger, created } = setup();
    await service.createIncome(user, incomeDto('fine'), meta);

    expect(tx.account.update).toHaveBeenCalledWith({
      where: { id: 'acc1' },
      data: { balance: { increment: D(100) } },
    });
    // هیچ «کم‌کردن/چکِ موجودی»ای در ثبتِ عایدی نیست
    expect(tx.account.updateMany).not.toHaveBeenCalled();
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      direction: 'IN',
      accountId: 'acc1',
      currencyId: 'afn',
      balanceAfter: D(5100),
      miscellaneousIncomeId: 'inc-new',
    });
    expect(created[0]).toMatchObject({ categoryId: 'fine', rootCategoryId: 'fine', createdById: 'u1' });
  });

  it('ثبت روی سب‌کتگوری: rootCategoryId = مادرِ آن (برای فیلتر و جمعِ بدونِ JOIN)', async () => {
    const { service, created, prisma } = setup();
    await service.createIncome(user, incomeDto('sign12'), meta);
    expect(created[0]).toMatchObject({ categoryId: 'sign12', rootCategoryId: 'sign' });
    // برای سب‌کتگوری لازم نیست فرزندانش بررسی شود
    expect(prisma.miscellaneousIncomeCategory.findFirst).not.toHaveBeenCalled();
  });

  it('مادرِ دارای سب‌کتگوریِ فعال: ثبتِ مستقیم رد می‌شود و تراکنشی شروع نمی‌شود', async () => {
    const { service, prisma } = setup();
    const err = await service.createIncome(user, incomeDto('sign'), meta).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toContain('اجاره تابلو');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('مادر + newSubcategoryName: سب‌کتگوری ساخته و عایدی روی آن ثبت می‌شود', async () => {
    const { service, created, createdCats, tx } = setup();
    await service.createIncome(user, incomeDto('sign', { newSubcategoryName: 'تابلو  ۱۳' }), meta);
    expect(createdCats[0]).toMatchObject({
      name: 'تابلو ۱۳',
      parentId: 'sign',
      scopeKey: 'sign',
      nameKey: nameKey('تابلو ۱۳'),
      marketId: 'mk1',
    });
    expect(created[0]).toMatchObject({ categoryId: 'new-sub', rootCategoryId: 'sign' });
    expect(tx.miscellaneousIncomeCategory.upsert).toHaveBeenCalled();
  });

  it('newSubcategoryName روی یک سب‌کتگوری رد می‌شود (فقط ۲ سطح)', async () => {
    const { service } = setup();
    await expect(
      service.createIncome(user, incomeDto('sign12', { newSubcategoryName: 'x' }), meta),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('کتگوریِ غیرفعال و کتگوریِ مارکتِ دیگر رد می‌شوند', async () => {
    const { service } = setup();
    await expect(service.createIncome(user, incomeDto('off'), meta)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.createIncome(user, incomeDto('other'), meta)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('تاریخِ آینده رد می‌شود و هیچ چیزی نوشته نمی‌شود', async () => {
    const { service, prisma } = setup();
    const err = await service
      .createIncome(user, incomeDto('fine', { date: '2999-01-01' }), meta)
      .catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('updateIncome — برگرداندنِ اثرِ قدیمی', () => {
  it('تغییرِ مبلغ بدونِ reason رد می‌شود', async () => {
    const { service, prisma } = setup();
    await expect(service.updateIncome(user, 'inc1', { amount: 500 } as any, meta)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('همان مبلغ و حساب را دوباره فرستادن «تغییرِ پول» حساب نمی‌شود (reason لازم نیست)', async () => {
    const { service, tx } = setup();
    await service.updateIncome(user, 'inc1', { amount: 1000, accountId: 'acc1', description: 'x' } as any, meta);
    expect(tx.account.update).not.toHaveBeenCalled();
    expect(tx.account.updateMany).not.toHaveBeenCalled();
  });

  it('افزایشِ مبلغ: فقط تفاضل به حساب اضافه می‌شود', async () => {
    const { service, tx } = setup();
    await service.updateIncome(user, 'inc1', { amount: 1300, reason: 'اشتباه تایپی' } as any, meta);
    expect(tx.account.update).toHaveBeenCalledWith({
      where: { id: 'acc1' },
      data: { balance: { increment: D(300) } },
    });
    expect(tx.account.updateMany).not.toHaveBeenCalled();
  });

  it('کاهشِ مبلغ: تفاضل با شرطِ balance >= x کم می‌شود؛ اگر پول خرج شده باشد ۴۰۹', async () => {
    const ok = setup();
    await ok.service.updateIncome(user, 'inc1', { amount: 400, reason: 'اصلاح' } as any, meta);
    expect(ok.tx.account.updateMany).toHaveBeenCalledWith({
      where: { id: 'acc1', balance: { gte: D(600) } },
      data: { balance: { decrement: D(600) } },
    });

    const spent = setup({ debitCount: 0 });
    const err = await spent.service
      .updateIncome(user, 'inc1', { amount: 400, reason: 'اصلاح' } as any, meta)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toContain('خرج');
  });

  it('عوض‌کردنِ حساب: از قدیمی (با چکِ موجودی) کم و به جدید اضافه می‌شود', async () => {
    const { service, tx } = setup();
    await service.updateIncome(user, 'inc1', { accountId: 'acc2', reason: 'حساب اشتباه' } as any, meta);
    // حسابِ mock همیشه فعال/هم‌بازار برمی‌گردد؛ مهم اینکه یک کم (guarded) و یک اضافه داریم
    expect(tx.account.updateMany).toHaveBeenCalledWith({
      where: { id: 'acc1', balance: { gte: D(1000) } },
      data: { balance: { decrement: D(1000) } },
    });
    expect(tx.account.update).toHaveBeenCalledWith({
      where: { id: 'acc2' },
      data: { balance: { increment: D(1000) } },
    });
  });

  it('عایدیِ قدیمیِ بدونِ ledger: تغییرِ پول رد می‌شود', async () => {
    const { service } = setup({ hasLedger: false });
    await expect(
      service.updateIncome(user, 'inc1', { amount: 400, reason: 'x' } as any, meta),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('تغییرِ فقط توضیح/تاریخ: ledger هم هم‌گام می‌شود', async () => {
    const { service, tx } = setup();
    await service.updateIncome(user, 'inc1', { description: 'توضیحِ تازه' } as any, meta);
    expect(tx.ledgerEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { miscellaneousIncomeId: 'inc1' } }),
    );
  });
});

describe('removeIncome', () => {
  it('بدونِ reason رد می‌شود', async () => {
    const { service, prisma } = setup();
    await expect(
      service.removeIncome(user, 'inc1', { reason: '   ' }, meta),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('مبلغ با شرطِ balance >= amount از حساب کم می‌شود و reason در audit می‌رود', async () => {
    const { service, tx, audit } = setup();
    await service.removeIncome(user, 'inc1', { reason: 'ثبتِ تکراری' }, meta);
    expect(tx.account.updateMany).toHaveBeenCalledWith({
      where: { id: 'acc1', balance: { gte: D(1000) } },
      data: { balance: { decrement: D(1000) } },
    });
    expect(tx.miscellaneousIncome.deleteMany).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DELETE', reason: 'ثبتِ تکراری', entityType: 'MiscellaneousIncome' }),
    );
  });

  it('اگر پول خرج شده باشد ۴۰۹ می‌دهد (موجودی منفی نمی‌شود) و audit نوشته نمی‌شود', async () => {
    const { service, audit } = setup({ debitCount: 0 });
    const err = await service
      .removeIncome(user, 'inc1', { reason: 'اشتباه' }, meta)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('دسته‌بندی', () => {
  it('نامِ تکراری (حتی با فاصله/ی-ي متفاوت) ۴۰۹ می‌دهد', async () => {
    const { service, tx } = setup({ clashingSibling: { id: 'x', name: 'اجاره تابلو' } });
    const err = await service
      .createCategory(user, { name: 'اجاره  تابلو' } as any, meta)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(tx.miscellaneousIncomeCategory.create).not.toHaveBeenCalled();
  });

  it('جلوی ایندکسِ یکتا: P2002 (درخواستِ هم‌زمان) به ۴۰۹ تبدیل می‌شود، نه ۵۰۰', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' });
    const { service } = setup({ createThrows: p2002 });
    await expect(service.createCategory(user, { name: 'تازه' } as any, meta)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('کلیدِ یکتایی: مادر = marketId، سب‌کتگوری = parentId', async () => {
    const { service, createdCats } = setup();
    await service.createCategory(
      user,
      { name: 'ثابت', subcategories: ['الف', 'ب'] } as any,
      meta,
    );
    expect(createdCats[0]).toMatchObject({ scopeKey: 'mk1', parentId: null });
    expect(createdCats[1]).toMatchObject({ scopeKey: createdCats[0].id, parentId: createdCats[0].id });
    expect(createdCats[2]).toMatchObject({ scopeKey: createdCats[0].id });
  });

  it('سب‌کتگوری زیرِ سب‌کتگوری (سطحِ سوم) رد می‌شود', async () => {
    const { service } = setup();
    await expect(
      service.createCategory(user, { name: 'x', parentId: 'sign12' } as any, meta),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('جابه‌جاییِ والد (parentId در update) رد می‌شود', async () => {
    const { service } = setup();
    await expect(
      service.updateCategory(user, 'sign12', { parentId: 'fine' } as any, meta),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
