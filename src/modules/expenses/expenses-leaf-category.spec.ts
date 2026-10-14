import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExpensesService } from './expenses.service';

jest.mock('../../common/utils/ensure-market-setup-complete', () => ({
  ensureMarketSetupComplete: jest.fn(async () => undefined),
}));
jest.mock('../../common/utils/ensure-currency-enabled-for-market', () => ({
  ensureCurrencyEnabledForMarket: jest.fn(async () => undefined),
}));
jest.mock('../../common/utils/resolve-rate-to-base', () => ({
  resolveRateToBase: jest.fn(async () => ({ exchangeRate: null, baseCurrencyAmount: null })),
}));

const D = (v: number | string) => new Prisma.Decimal(v);
const meta = { ip: '127.0.0.1', userAgent: 'jest' };

// معاشات (مادر) ← فهیم / نذیراحمد (سب‌کتگوری)؛ تیل (مادرِ بدونِ سب‌کتگوری)
const cat = (id: string, name: string, parentId: string | null, over: object = {}) => ({
  id,
  name,
  parentId,
  marketId: 'mk1',
  isActive: true,
  ...over,
});
const CATS: Record<string, ReturnType<typeof cat>> = {
  salaries: cat('salaries', 'معاشات', null),
  nazir: cat('nazir', 'نذیراحمد', 'salaries'),
  fuel: cat('fuel', 'تیل', null),
};

function setup(opts: { activeChildren?: Record<string, number>; existingExpenseCategoryId?: string } = {}) {
  const activeChildren = opts.activeChildren ?? { salaries: 2, fuel: 0 };
  const createdExpenses: any[] = [];
  const createdSubs: any[] = [];

  const tx = {
    expenseCategory: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async (args: any) => {
        const sub = { id: 'new-sub', isActive: true, ...args.data };
        createdSubs.push(sub);
        return sub;
      }),
    },
    account: {
      updateMany: jest.fn(async () => ({ count: 1 })),
      update: jest.fn(async () => ({})),
      findUniqueOrThrow: jest.fn(async () => ({ id: 'acc1', balance: D(5000) })),
    },
    expense: {
      create: jest.fn(async (args: any) => {
        createdExpenses.push(args.data);
        return { id: 'exp-new', ...args.data };
      }),
      update: jest.fn(async (args: any) => ({ id: 'exp1', ...args.data })),
    },
    ledgerEntry: { create: jest.fn(async () => ({})) },
  };

  const prisma: any = {
    user: {
      findUnique: jest.fn(async () => ({ id: 'u1', role: 'ACCOUNTANT', marketId: 'mk1' })),
    },
    expenseCategory: {
      findUnique: jest.fn(async ({ where }: any) => CATS[where.id] ?? null),
      count: jest.fn(async ({ where }: any) => activeChildren[where.parentId] ?? 0),
    },
    account: {
      findUnique: jest.fn(async () => ({
        id: 'acc1',
        marketId: 'mk1',
        currencyId: 'afn',
        isActive: true,
      })),
    },
    expense: {
      findUnique: jest.fn(async () => ({
        id: 'exp1',
        marketId: 'mk1',
        categoryId: opts.existingExpenseCategoryId ?? 'salaries',
        accountId: 'acc1',
        currencyId: 'afn',
        amount: D(1000),
        exchangeRate: null,
        expenseDate: new Date('2026-09-26T00:00:00Z'),
        description: 'قدیمی',
      })),
    },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const service = new ExpensesService(prisma, audit as any);
  return { service, prisma, tx, createdExpenses, createdSubs };
}

const dtoFor = (categoryId: string, extra: object = {}) =>
  ({ categoryId, accountId: 'acc1', amount: 1000, ...extra }) as any;

describe('ExpensesService.createExpense — مصرف فقط روی برگ', () => {
  it('مادرِ دارایِ سب‌کتگوریِ فعال: ثبتِ مستقیم روی خودش رد می‌شود و هیچ چیزی نوشته نمی‌شود', async () => {
    const { service, prisma } = setup();
    const err = await service
      .createExpense({ id: 'u1' }, dtoFor('salaries'), meta)
      .catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toContain('معاشات');
    expect(err.message).toContain('سب‌کتگوری');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('فقط سب‌کتگوریِ «فعال» حساب می‌شود (کوئریِ شمارش با isActive:true)', async () => {
    const { service, prisma } = setup();
    await service.createExpense({ id: 'u1' }, dtoFor('salaries'), meta).catch(() => undefined);
    expect(prisma.expenseCategory.count).toHaveBeenCalledWith({
      where: { parentId: 'salaries', isActive: true },
    });
  });

  it('ثبت روی سب‌کتگوری (نذیراحمد) مجاز است و categoryId همان ذخیره می‌شود', async () => {
    const { service, prisma, createdExpenses } = setup();
    await service.createExpense({ id: 'u1' }, dtoFor('nazir'), meta);
    expect(createdExpenses).toHaveLength(1);
    expect(createdExpenses[0].categoryId).toBe('nazir');
    // برای سب‌کتگوری اصلاً لازم نیست فرزندانش شمرده شود
    expect(prisma.expenseCategory.count).not.toHaveBeenCalled();
  });

  it('مادر + newSubcategoryName مجاز است: سب‌کتگوری ساخته و مصرف روی آن ثبت می‌شود', async () => {
    const { service, createdExpenses, createdSubs } = setup();
    await service.createExpense(
      { id: 'u1' },
      dtoFor('salaries', { newSubcategoryName: 'احمد آشپز' }),
      meta,
    );
    expect(createdSubs).toHaveLength(1);
    expect(createdSubs[0]).toMatchObject({ name: 'احمد آشپز', parentId: 'salaries' });
    expect(createdExpenses[0].categoryId).toBe('new-sub');
  });

  it('مادرِ بدونِ سب‌کتگوریِ فعال (تیل) مستقیم مصرف می‌پذیرد', async () => {
    const { service, createdExpenses } = setup();
    await service.createExpense({ id: 'u1' }, dtoFor('fuel'), meta);
    expect(createdExpenses[0].categoryId).toBe('fuel');
  });
});

describe('ExpensesService.updateExpense — فقط وقتی کتگوری عوض می‌شود', () => {
  const user = { id: 'u1' };

  it('عوض‌کردنِ کتگوریِ یک مصرف به مادرِ دارایِ سب‌کتگوری رد می‌شود', async () => {
    const { service, prisma } = setup({ existingExpenseCategoryId: 'nazir' });
    const err = await service
      .updateExpense(user, 'exp1', { categoryId: 'salaries' } as any, meta)
      .catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toContain('معاشات');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('مصرفِ قدیمیِ ثبت‌شده روی مادر: ویرایشِ توضیح (بدون تغییرِ کتگوری) همچنان ممکن است', async () => {
    const { service, prisma } = setup({ existingExpenseCategoryId: 'salaries' });
    await expect(
      service.updateExpense(user, 'exp1', { description: 'اصلاح توضیح' } as any, meta),
    ).resolves.toBeDefined();
    expect(prisma.expenseCategory.count).not.toHaveBeenCalled();
  });

  it('همان categoryId قبلی را دوباره فرستادن «تغییرِ کتگوری» حساب نمی‌شود', async () => {
    const { service, prisma } = setup({ existingExpenseCategoryId: 'salaries' });
    await expect(
      service.updateExpense(
        user,
        'exp1',
        { categoryId: 'salaries', description: 'x' } as any,
        meta,
      ),
    ).resolves.toBeDefined();
    expect(prisma.expenseCategory.count).not.toHaveBeenCalled();
  });

  it('جابه‌جایی به یک سب‌کتگوری مجاز است', async () => {
    const { service } = setup({ existingExpenseCategoryId: 'fuel' });
    await expect(
      service.updateExpense(user, 'exp1', { categoryId: 'nazir' } as any, meta),
    ).resolves.toBeDefined();
  });
});
