import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ensureMarketSetupComplete } from '../../common/utils/ensure-market-setup-complete';
import { ensureCurrencyEnabledForMarket } from '../../common/utils/ensure-currency-enabled-for-market';
import { paginate, resolveSort, buildSearchWhere } from '../../common/utils/pagination';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import { ExpenseCategoryQueryDto } from './dto/expense-category-query.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { ExpenseSummaryQueryDto } from './dto/expense-summary-query.dto';

type Actor = { id: string; role: string; marketId: string | null };

// دسته‌بندی مصرف + خودِ مصرف در یک فایل، دقیقاً مثل ShareholdersService (سهام‌دار +
// سهم + تراکنش یک‌جا) — نه چند فایل جدا برای هر بخش کوچک.
@Injectable()
export class ExpensesService {
  private static readonly CATEGORY_SORT_FIELDS = ['name', 'createdAt'] as const;
  private static readonly CATEGORY_SEARCH_FIELDS = ['name'] as const;
  private static readonly EXPENSE_SORT_FIELDS = ['amount', 'expenseDate', 'createdAt'] as const;
  private static readonly EXPENSE_SEARCH_FIELDS = ['description'] as const;

  constructor(private readonly prisma: PrismaService) {}

  private async getActor(currentUser: { id: string }): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, role: true, marketId: true },
    });
    if (!user) throw new ForbiddenException('کاربر معتبر نیست');
    return user;
  }

   private ensureAccess(actor: Actor, entityMarketId: string | null, message: string) {
    if (actor.role === 'SUPER_ADMIN') return;
    if (entityMarketId === null || actor.marketId !== entityMarketId) {
      throw new ForbiddenException(message);
    }
  }

  private resolveMarketId(actor: Actor, providedMarketId: string | undefined): string {
    if (actor.role === 'SUPER_ADMIN') {
      if (!providedMarketId) {
        throw new BadRequestException('برای سوپر ادمین، marketId الزامی است');
      }
      return providedMarketId;
    }
    if (!actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }
    return actor.marketId;
  }

  // ==========================================================================
  // دسته‌بندی‌های مصرف (ExpenseCategory)
  // ==========================================================================

  private async findCategoryOrThrow(id: string) {
    const category = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('دسته‌بندی یافت نشد');
    return category;
  }

  // سب‌کتگوری فقط زیرِ یک کتگوریِ مادرِ واقعی مجاز است (سطحِ سوم ممنوع) — یک کوئریِ
  // ایندکس‌شده (findUnique روی id)، نه پیمایشِ زنجیره.
  private async findParentOrThrow(parentId: string) {
    const parent = await this.prisma.expenseCategory.findUnique({
      where: { id: parentId },
    });
    if (!parent) throw new NotFoundException('کتگوریِ مادر یافت نشد');
    if (parent.parentId !== null) {
      throw new BadRequestException(
        'سب‌کتگوری نمی‌تواند زیرِ کتگوریِ دیگری باشد که خودش سب‌کتگوری است — فقط ۲ سطح مجاز است',
      );
    }
    return parent;
  }

  async createCategory(currentUser: { id: string }, dto: CreateExpenseCategoryDto) {
    const actor = await this.getActor(currentUser);

    let marketId: string | null;
    let parent: { id: string; marketId: string | null } | null = null;

    if (dto.parentId) {
      parent = await this.findParentOrThrow(dto.parentId);
      this.ensureAccess(actor, parent.marketId, 'دسترسی به این کتگوریِ مادر مجاز نیست');
      // سب‌کتگوری همیشه بازارِ والدش را به ارث می‌برد — marketId ورودی نادیده گرفته می‌شود
      // تا هیچ‌وقت سب‌کتگوری و والدش در دو بازارِ متفاوت قرار نگیرند.
      marketId = parent.marketId;
    } else {
      marketId = actor.role === 'SUPER_ADMIN' ? (dto.marketId ?? null) : actor.marketId;
      if (marketId === null && actor.role !== 'SUPER_ADMIN') {
        throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
      }
    }

    return this.prisma.expenseCategory.create({
      data: { marketId, name: dto.name.trim(), parentId: parent?.id ?? null },
    });
  }

  async findAllCategories(currentUser: { id: string }, query: ExpenseCategoryQueryDto) {
    const actor = await this.getActor(currentUser);
    const where: any =
      actor.role === 'SUPER_ADMIN'
        ? {}
        : { OR: [{ marketId: null }, { marketId: actor.marketId }] };

    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.parentId === 'root') {
      where.parentId = null;
    } else if (query.parentId !== undefined) {
      where.parentId = query.parentId;
    }

    const searchWhere = buildSearchWhere(ExpensesService.CATEGORY_SEARCH_FIELDS, query.search);
    if (searchWhere) where.AND = [searchWhere];

    const orderBy = resolveSort(
      query.sortBy,
      query.sortOrder,
      ExpensesService.CATEGORY_SORT_FIELDS,
      { name: 'asc' },
    );

    // parent را هم include می‌کنیم (یک JOIN، نه کوئریِ جدا) تا فرانت بدون رفت‌وبرگشتِ
    // اضافه بداند این ردیف کتگوریِ مادر است یا سب‌کتگوریِ کدام‌یک.
    return paginate(this.prisma.expenseCategory, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      include: { parent: { select: { id: true, name: true } } },
    });
  }

  async findOneCategory(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const category = await this.findCategoryOrThrow(id);
    // برخلاف update/remove: دسته‌بندی سراسری (marketId خالی) برای خواندن باز است —
    // همان چیزی که در findAllCategories هم می‌بینند، فقط این‌جا هم باید یکسان باشد.
    if (
      actor.role !== 'SUPER_ADMIN' &&
      category.marketId !== null &&
      category.marketId !== actor.marketId
    ) {
      throw new ForbiddenException('دسترسی به این دسته‌بندی مجاز نیست');
    }
    return category;
  }

  async updateCategory(currentUser: { id: string }, id: string, dto: UpdateExpenseCategoryDto) {
    const actor = await this.getActor(currentUser);
    const category = await this.findCategoryOrThrow(id);
    this.ensureAccess(actor, category.marketId, 'دسترسی به این دسته‌بندی مجاز نیست');

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    if (dto.parentId !== undefined) {
      if (dto.parentId === null) {
        data.parentId = null;
      } else {
        if (dto.parentId === id) {
          throw new BadRequestException('یک کتگوری نمی‌تواند والدِ خودش باشد');
        }
        const childrenCount = await this.prisma.expenseCategory.count({
          where: { parentId: id },
        });
        if (childrenCount > 0) {
          throw new BadRequestException(
            'این کتگوری خودش سب‌کتگوری دارد، نمی‌تواند زیرِ کتگوریِ دیگری برود — فقط ۲ سطح مجاز است',
          );
        }
        const parent = await this.findParentOrThrow(dto.parentId);
        this.ensureAccess(actor, parent.marketId, 'دسترسی به این کتگوریِ مادر مجاز نیست');
        data.parentId = parent.id;
        data.marketId = parent.marketId;
      }
    }

    return this.prisma.expenseCategory.update({ where: { id }, data });
  }

  async removeCategory(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const category = await this.findCategoryOrThrow(id);
    this.ensureAccess(actor, category.marketId, 'دسترسی به این دسته‌بندی مجاز نیست');

    const [expensesCount, childrenCount] = await Promise.all([
      this.prisma.expense.count({ where: { categoryId: id } }),
      this.prisma.expenseCategory.count({ where: { parentId: id } }),
    ]);
    if (expensesCount > 0) {
      throw new ConflictException(
        'این دسته‌بندی دارای مصرف ثبت‌شده است و قابل حذف نیست؛ می‌توانید آن را غیرفعال کنید',
      );
    }
    if (childrenCount > 0) {
      throw new ConflictException(
        'این کتگوری دارای سب‌کتگوری است و قابل حذف نیست؛ اول سب‌کتگوری‌ها را حذف یا جابه‌جا کنید',
      );
    }

    await this.prisma.expenseCategory.delete({ where: { id } });
    return { message: `دسته‌بندی «${category.name}» حذف شد` };
  }

  // ==========================================================================
  // مصارف (Expense)
  // خرید/برداشت پول دقیقاً همان الگوی atomic-ledger که در AccountsService.transfer
  // و ShareholdersService.createTransaction استفاده شده.
  // ==========================================================================

  private async validateCategoryAndAccount(
    marketId: string,
    categoryId: string,
    accountId: string,
    currencyId: string,
  ) {
    const category = await this.prisma.expenseCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('دسته‌بندی یافت نشد');
    if (category.marketId !== null && category.marketId !== marketId) {
      throw new BadRequestException('دسته‌بندی باید سراسری یا متعلق به همان بازار باشد');
    }

    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('حساب یافت نشد');
    if (account.marketId !== marketId) {
      throw new BadRequestException('حساب باید متعلق به همان بازار باشد');
    }
    if (account.currencyId !== currencyId) {
      throw new BadRequestException(
        'ارز حساب باید با ارز مصرف یکی باشد (این عملیات نرخ تبدیل ارز را حساب نمی‌کند)',
      );
    }
    if (!account.isActive) {
      throw new ConflictException('حساب غیرفعال است');
    }

    return account;
  }

  async createExpense(currentUser: { id: string }, dto: CreateExpenseDto) {
    const actor = await this.getActor(currentUser);
    const marketId = this.resolveMarketId(actor, dto.marketId);

    await ensureMarketSetupComplete(this.prisma, marketId);
    await this.validateCategoryAndAccount(marketId, dto.categoryId, dto.accountId, dto.currencyId);
    await ensureCurrencyEnabledForMarket(this.prisma, marketId, dto.currencyId);

    const amount = new Prisma.Decimal(dto.amount);
    const expenseDate = dto.expenseDate ? new Date(dto.expenseDate) : new Date();

    return this.prisma.$transaction(async (tx) => {
      const debited = await tx.account.updateMany({
        where: { id: dto.accountId, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });
      if (debited.count === 0) {
        throw new ConflictException('موجودی حساب برای این مصرف کافی نیست');
      }
      const updatedAccount = await tx.account.findUniqueOrThrow({ where: { id: dto.accountId } });

      const expense = await tx.expense.create({
        data: {
          marketId,
          categoryId: dto.categoryId,
          amount,
          currencyId: dto.currencyId,
          usdEquivalent:
            dto.usdEquivalent !== undefined ? new Prisma.Decimal(dto.usdEquivalent) : null,
          expenseDate,
          description: dto.description?.trim() || null,
          accountId: dto.accountId,
          paidById: actor.id,
          receiptImage: dto.receiptImage?.trim() || null,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          marketId,
          accountId: dto.accountId,
          currencyId: dto.currencyId,
          direction: 'OUT',
          amount,
          balanceAfter: updatedAccount.balance,
          entryDate: expenseDate,
          description: `مصرف: ${dto.description?.trim() || ''}`.trim(),
          expenseId: expense.id,
          createdById: actor.id,
        },
      });

      return expense;
    });
  }

  async findAllExpenses(currentUser: { id: string }, query: ExpenseQueryDto) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }
    const where: any = {
      ...(actor.role === 'SUPER_ADMIN' ? {} : { marketId: actor.marketId! }),
    };

    // اگر categoryId یک کتگوریِ مادر باشد، خودکار مصارفِ همهٔ سب‌کتگوری‌هایش هم می‌آید —
    // یک فیلترِ رابطه‌ای (JOIN با OR روی id/parent_id، هر دو ایندکس‌شده)، نه دو کوئریِ جدا.
    if (query.categoryId !== undefined) {
      where.category = { OR: [{ id: query.categoryId }, { parentId: query.categoryId }] };
    }
    if (query.accountId !== undefined) where.accountId = query.accountId;
    if (query.currencyId !== undefined) where.currencyId = query.currencyId;
    if (query.fromDate !== undefined || query.toDate !== undefined) {
      where.expenseDate = {
        ...(query.fromDate !== undefined ? { gte: new Date(query.fromDate) } : {}),
        ...(query.toDate !== undefined ? { lte: new Date(query.toDate) } : {}),
      };
    }

    const searchWhere = buildSearchWhere(ExpensesService.EXPENSE_SEARCH_FIELDS, query.search);
    if (searchWhere) where.AND = [searchWhere];

    const orderBy = resolveSort(
      query.sortBy,
      query.sortOrder,
      ExpensesService.EXPENSE_SORT_FIELDS,
      { expenseDate: 'desc' },
    );

    return paginate(this.prisma.expense, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      include: {
        category: {
          select: { id: true, name: true, parent: { select: { id: true, name: true } } },
        },
        account: { select: { id: true, name: true } },
        currency: { select: { id: true, code: true, name: true } },
        paidBy: { select: { id: true, fullName: true } },
      },
    });
  }

  // خلاصهٔ «تاحال/در این بازه چقدر» — یک aggregate، نه fetch+reduce: هیچ ردیفِ خامِ
  // Expense خوانده نمی‌شود، فقط SUM از دیتابیس برمی‌گردد. چون مصارف می‌توانند چند ارزی
  // باشند، حتماً به‌ازای هر ارز جدا جمع می‌زنیم (جمع‌کردنِ دو ارزِ متفاوت در یک عدد غلط
  // است) — با groupBy روی currencyId، یک کوئری برای همهٔ ارزها با هم.
  async getExpenseSummary(currentUser: { id: string }, query: ExpenseSummaryQueryDto) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }

    const category = await this.findCategoryOrThrow(query.categoryId);
    // کتگوریِ سراسری (marketId=null) برای خواندن باز است — همان قاعدهٔ findOneCategory.
    if (
      actor.role !== 'SUPER_ADMIN' &&
      category.marketId !== null &&
      category.marketId !== actor.marketId
    ) {
      throw new ForbiddenException('دسترسی به این دسته‌بندی مجاز نیست');
    }

    const where: any = {
      ...(actor.role === 'SUPER_ADMIN' ? {} : { marketId: actor.marketId! }),
      category: { OR: [{ id: query.categoryId }, { parentId: query.categoryId }] },
    };
    if (query.fromDate !== undefined || query.toDate !== undefined) {
      where.expenseDate = {
        ...(query.fromDate !== undefined ? { gte: new Date(query.fromDate) } : {}),
        ...(query.toDate !== undefined ? { lte: new Date(query.toDate) } : {}),
      };
    }

    const byCurrency = await this.prisma.expense.groupBy({
      by: ['currencyId'],
      where,
      _sum: { amount: true },
      _count: true,
    });

    const currencyIds = byCurrency.map((g) => g.currencyId);
    const currencies = currencyIds.length
      ? await this.prisma.currency.findMany({
          where: { id: { in: currencyIds } },
          select: { id: true, code: true },
        })
      : [];
    const currencyCodeById = new Map(currencies.map((c) => [c.id, c.code]));

    return {
      categoryId: category.id,
      categoryName: category.name,
      isParentCategory: category.parentId === null,
      fromDate: query.fromDate ?? null,
      toDate: query.toDate ?? null,
      totalsByCurrency: byCurrency.map((g) => ({
        currencyId: g.currencyId,
        currencyCode: currencyCodeById.get(g.currencyId) ?? null,
        totalAmount: g._sum.amount ?? new Prisma.Decimal(0),
        count: g._count,
      })),
    };
  }

  private async findExpenseOrThrow(id: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('مصرف یافت نشد');
    return expense;
  }

  async findOneExpense(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const expense = await this.findExpenseOrThrow(id);
    this.ensureAccess(actor, expense.marketId, 'دسترسی به این مصرف مجاز نیست');

    return this.prisma.expense.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
        currency: { select: { id: true, code: true, name: true } },
        paidBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async updateExpense(currentUser: { id: string }, id: string, dto: UpdateExpenseDto) {
    const actor = await this.getActor(currentUser);
    const expense = await this.findExpenseOrThrow(id);
    this.ensureAccess(actor, expense.marketId, 'دسترسی به این مصرف مجاز نیست');

    const nextCategoryId = dto.categoryId ?? expense.categoryId;
    const nextAccountId = dto.accountId ?? expense.accountId;
    const nextCurrencyId = dto.currencyId ?? expense.currencyId;
    const nextAmount = dto.amount !== undefined ? new Prisma.Decimal(dto.amount) : expense.amount;

    const moneyChanged =
      dto.amount !== undefined || dto.accountId !== undefined || dto.currencyId !== undefined;

    if (dto.categoryId !== undefined || moneyChanged) {
      await this.validateCategoryAndAccount(
        expense.marketId,
        nextCategoryId,
        nextAccountId,
        nextCurrencyId,
      );
    }

    const data: Record<string, unknown> = {};
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.expenseDate !== undefined) data.expenseDate = new Date(dto.expenseDate);
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.usdEquivalent !== undefined) data.usdEquivalent = new Prisma.Decimal(dto.usdEquivalent);
    if (dto.receiptImage !== undefined) data.receiptImage = dto.receiptImage?.trim() || null;

    if (!moneyChanged) {
      return this.prisma.expense.update({ where: { id }, data });
    }

    // مبلغ/حساب/ارز عوض شده: اول اثر قبلی برگردانده می‌شود، بعد اثر جدید اعمال می‌شود —
    // همه در یک تراکنش تا حساب هیچ‌وقت در حالت میانه (فقط برگشت‌خورده) دیده نشود.
    return this.prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: expense.accountId },
        data: { balance: { increment: expense.amount } },
      });

      const debited = await tx.account.updateMany({
        where: { id: nextAccountId, balance: { gte: nextAmount } },
        data: { balance: { decrement: nextAmount } },
      });
      if (debited.count === 0) {
        throw new ConflictException('موجودی حساب برای این ویرایش کافی نیست');
      }
      const updatedAccount = await tx.account.findUniqueOrThrow({ where: { id: nextAccountId } });

      data.amount = nextAmount;
      data.accountId = nextAccountId;
      data.currencyId = nextCurrencyId;
      const updatedExpense = await tx.expense.update({ where: { id }, data });

      await tx.ledgerEntry.update({
        where: { expenseId: id },
        data: {
          accountId: nextAccountId,
          currencyId: nextCurrencyId,
          amount: nextAmount,
          balanceAfter: updatedAccount.balance,
          entryDate: updatedExpense.expenseDate,
          description: `مصرف: ${updatedExpense.description ?? ''}`.trim(),
        },
      });

      return updatedExpense;
    });
  }

  async removeExpense(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const expense = await this.findExpenseOrThrow(id);
    this.ensureAccess(actor, expense.marketId, 'دسترسی به این مصرف مجاز نیست');

    await this.prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: expense.accountId },
        data: { balance: { increment: expense.amount } },
      });
      // LedgerEntry مرتبط به‌خاطر onDelete: Cascade خودش پاک می‌شود.
      await tx.expense.delete({ where: { id } });
    });

    return { message: 'مصرف حذف شد و مبلغش به حساب برگشت' };
  }
}
