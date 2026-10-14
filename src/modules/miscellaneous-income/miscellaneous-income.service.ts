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
import { resolveRateToBase } from '../../common/utils/resolve-rate-to-base';
import { cleanName, nameKey } from '../../common/utils/category-name';
import { kabulDate } from '../../common/utils/kabul-date';
import { paginate, resolveSort, buildSearchWhere } from '../../common/utils/pagination';
import { hashRequest, runIdempotent } from '../../common/idempotency/idempotency';
import { AuditLogService } from '../../common/audit-log/audit-log.service';
import { RequestMeta } from '../../common/audit-log/request-meta.util';
import { CreateMiscellaneousIncomeCategoryDto } from './dto/create-miscellaneous-income-category.dto';
import { UpdateMiscellaneousIncomeCategoryDto } from './dto/update-miscellaneous-income-category.dto';
import { MiscellaneousIncomeCategoryQueryDto } from './dto/miscellaneous-income-category-query.dto';
import { CreateMiscellaneousIncomeDto } from './dto/create-miscellaneous-income.dto';
import { UpdateMiscellaneousIncomeDto } from './dto/update-miscellaneous-income.dto';
import { MiscellaneousIncomeQueryDto } from './dto/miscellaneous-income-query.dto';
import { MiscellaneousIncomeSummaryQueryDto } from './dto/miscellaneous-income-summary-query.dto';
import { MiscellaneousIncomeBreakdownQueryDto } from './dto/miscellaneous-income-breakdown-query.dto';
import { RemoveMiscellaneousIncomeDto } from './dto/remove-miscellaneous-income.dto';

type Actor = { id: string; role: string; marketId: string | null };

type CategoryDb = Pick<Prisma.TransactionClient, 'miscellaneousIncomeCategory'>;

type CurrencyAmount = {
  currencyId: string;
  currencyCode: string | null;
  amount: Prisma.Decimal;
  // معادلِ ارز پایه با نرخِ همان روزِ هر عایدی (اسنپ‌شاتِ ذخیره‌شده)؛ عایدی‌های بدونِ نرخ در جمع نمی‌آیند.
  amountInBase: Prisma.Decimal;
  count: number;
};

type GroupRow = {
  currencyId: string;
  _sum: { amount: Prisma.Decimal | null; baseCurrencyAmount: Prisma.Decimal | null };
  _count: number;
};

const ZERO = new Prisma.Decimal(0);

// دسته‌بندیِ عواید متفرقه + خودِ عایدی در یک فایل، دقیقاً مثل ExpensesService — با این تفاوت که
// جریانِ پول برعکس است: ثبتِ عایدی موجودیِ حسابِ مقصد را «زیاد» می‌کند (ledger IN)، و برای همین
// خطرِ اصلی در «ویرایش/حذف» است (برگرداندنِ پولی که شاید قبلاً خرج شده)، نه در ثبت.
@Injectable()
export class MiscellaneousIncomeService {
  private static readonly CATEGORY_SORT_FIELDS = ['name', 'createdAt'] as const;
  private static readonly CATEGORY_SEARCH_FIELDS = ['name'] as const;
  private static readonly INCOME_SORT_FIELDS = ['amount', 'date', 'createdAt'] as const;
  private static readonly INCOME_SEARCH_FIELDS = ['description', 'category.name'] as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  private async getActor(currentUser: { id: string }): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, role: true, marketId: true },
    });
    if (!user) throw new ForbiddenException('کاربر معتبر نیست');
    return user;
  }

  private ensureAccess(actor: Actor, entityMarketId: string, message: string) {
    if (actor.role === 'SUPER_ADMIN') return;
    if (actor.marketId !== entityMarketId) throw new ForbiddenException(message);
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

  // محدوده‌ی مارکت برای لیست‌ها: ادمینِ عادی همیشه مارکتِ خودش؛ سوپرادمین اختیاری (بدونِ آن همه).
  private listMarketFilter(actor: Actor, marketId: string | undefined) {
    if (actor.role === 'SUPER_ADMIN') return marketId ? { marketId } : {};
    if (!actor.marketId) throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    return { marketId: actor.marketId };
  }

  private isUniqueViolation(e: unknown): boolean {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
  }

  // دو درخواستِ هم‌زمانِ هم‌نام: بررسیِ قبل از ساخت هر دو رد می‌شود ولی ایندکسِ یکتای دیتابیس دومی را
  // رد می‌کند (P2002) — به همان ۴۰۹ِ آشنا تبدیل می‌شود، نه ۵۰۰.
  private rethrowDuplicateAsConflict(e: unknown): never {
    if (this.isUniqueViolation(e)) {
      throw new ConflictException(
        'کتگوری یا سب‌کتگوری با همین نام از قبل وجود دارد (یا هم‌زمان ساخته شد)؛ دوباره بررسی کنید',
      );
    }
    throw e;
  }

  // «حوزهٔ یکتایی» نام: مادرها = marketId، سب‌کتگوری‌ها = parentId (ن.ک. اسکیمای دسته‌بندی).
  private scopeKeyOf(c: { parentId: string | null; marketId: string }): string {
    return c.parentId ?? c.marketId;
  }

  private dateRangeWhere(fromDate?: string, toDate?: string) {
    if (fromDate === undefined && toDate === undefined) return {};
    const range: { gte?: Date; lt?: Date; lte?: Date } = {};
    if (fromDate !== undefined) range.gte = new Date(fromDate);
    if (toDate !== undefined) {
      // تاریخِ بدونِ ساعت ('2026-10-10') یعنی «تا آخرِ همان روز»، نه نیمه‌شبِ اولش — وگرنه
      // عایدی‌های خودِ روزِ آخر در بازه نمی‌افتند.
      if (/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
        const next = new Date(toDate);
        next.setUTCDate(next.getUTCDate() + 1);
        range.lt = next;
      } else {
        range.lte = new Date(toDate);
      }
    }
    return { date: range };
  }

  // پولی که هنوز نگرفته‌ایم نباید در دفتر کل و گزارش‌ها دیده شود (همان قاعدهٔ پرداخت‌های کرایه/برق).
  // مقایسه با «روزِ تقویمیِ کابل» است؛ گذشته عمداً محدود نیست (ثبتِ دیرهنگام عادی است).
  private assertDateNotInFuture(date: Date) {
    if (Number.isNaN(date.getTime())) throw new BadRequestException('تاریخ عایدی نامعتبر است');
    if (kabulDate(date).getTime() > kabulDate(new Date()).getTime()) {
      throw new BadRequestException('تاریخ عایدی نمی‌تواند در آینده باشد');
    }
  }

  // ==========================================================================
  // دسته‌بندی‌های عواید متفرقه (MiscellaneousIncomeCategory)
  // ==========================================================================

  private async findCategoryOrThrow(id: string) {
    const category = await this.prisma.miscellaneousIncomeCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('دسته‌بندی یافت نشد');
    return category;
  }

  // سب‌کتگوری فقط زیرِ یک کتگوریِ مادرِ واقعی مجاز است (سطحِ سوم ممنوع) — یک کوئریِ
  // ایندکس‌شده (findUnique روی id)، نه پیمایشِ زنجیره.
  private async findParentOrThrow(parentId: string) {
    const parent = await this.prisma.miscellaneousIncomeCategory.findUnique({
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

  // بررسیِ تکراری‌بودنِ نام فقط برای پیامِ دوستانه است (یک lookupِ O(1) روی ایندکسِ یکتا)؛ تضمینِ
  // واقعی همان @@unique([scopeKey, nameKey]) در دیتابیس است که هم‌زمانی را هم می‌گیرد.
  private async assertCategoryNameFree(
    db: CategoryDb,
    scope: { parentId: string | null; marketId: string },
    name: string,
    excludeId?: string,
  ) {
    const clash = await db.miscellaneousIncomeCategory.findUnique({
      where: {
        scopeKey_nameKey: {
          scopeKey: this.scopeKeyOf(scope),
          nameKey: nameKey(name),
        },
      },
      select: { id: true, name: true },
    });
    if (clash && clash.id !== excludeId) {
      throw new ConflictException(
        scope.parentId !== null
          ? `سب‌کتگوری «${clash.name}» زیر همین کتگوری از قبل وجود دارد`
          : `کتگوری «${clash.name}» از قبل وجود دارد`,
      );
    }
  }

  private async insertCategory(
    tx: Prisma.TransactionClient,
    scope: { parentId: string | null; marketId: string },
    name: string,
    actor: Actor,
    meta: RequestMeta,
  ) {
    await this.assertCategoryNameFree(tx, scope, name);
    const category = await tx.miscellaneousIncomeCategory.create({
      data: {
        marketId: scope.marketId,
        name,
        nameKey: nameKey(name),
        scopeKey: this.scopeKeyOf(scope),
        parentId: scope.parentId,
      },
    });
    await this.auditLog.record({
      tx,
      action: 'CREATE',
      entityType: 'MiscellaneousIncomeCategory',
      entityId: category.id,
      marketId: scope.marketId,
      userId: actor.id,
      newData: category,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return category;
  }

  async createCategory(
    currentUser: { id: string },
    dto: CreateMiscellaneousIncomeCategoryDto,
    meta: RequestMeta,
  ) {
    const actor = await this.getActor(currentUser);

    const name = cleanName(dto.name);
    if (!name) throw new BadRequestException('نام کتگوری نمی‌تواند خالی باشد');

    let subNames: string[] = [];
    if (dto.subcategories !== undefined) {
      if (dto.parentId) {
        throw new BadRequestException(
          'سب‌کتگوری نمی‌تواند خودش سب‌کتگوری داشته باشد؛ subcategories فقط هنگام ساختِ کتگوریِ مادر مجاز است',
        );
      }
      subNames = dto.subcategories.map(cleanName);
      if (subNames.some((n) => !n)) {
        throw new BadRequestException('نامِ سب‌کتگوری نمی‌تواند خالی باشد');
      }
      const keys = subNames.map(nameKey);
      if (new Set(keys).size !== keys.length) {
        throw new BadRequestException('نامِ سب‌کتگوری‌ها در این فهرست تکراری است');
      }
    }

    let marketId: string;
    let parentId: string | null = null;

    if (dto.parentId) {
      const parent = await this.findParentOrThrow(dto.parentId);
      this.ensureAccess(actor, parent.marketId, 'دسترسی به این کتگوریِ مادر مجاز نیست');
      // سب‌کتگوری همیشه بازارِ والدش را به ارث می‌برد — marketId ورودی نادیده گرفته می‌شود
      // تا هیچ‌وقت سب‌کتگوری و والدش در دو بازارِ متفاوت قرار نگیرند.
      marketId = parent.marketId;
      parentId = parent.id;
    } else {
      marketId = this.resolveMarketId(actor, dto.marketId);
      if (actor.role === 'SUPER_ADMIN') {
        const market = await this.prisma.market.findUnique({
          where: { id: marketId },
          select: { id: true },
        });
        if (!market) throw new NotFoundException('بازار یافت نشد');
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const category = await this.insertCategory(tx, { parentId, marketId }, name, actor, meta);
        if (subNames.length === 0) return category;

        const children = [];
        for (const subName of subNames) {
          children.push(
            await this.insertCategory(tx, { parentId: category.id, marketId }, subName, actor, meta),
          );
        }
        return { ...category, children };
      });
    } catch (e) {
      this.rethrowDuplicateAsConflict(e);
    }
  }

  async findAllCategories(currentUser: { id: string }, query: MiscellaneousIncomeCategoryQueryDto) {
    const actor = await this.getActor(currentUser);
    const where: Prisma.MiscellaneousIncomeCategoryWhereInput = {
      ...this.listMarketFilter(actor, query.marketId),
    };

    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.parentId === 'root') {
      where.parentId = null;
    } else if (query.parentId !== undefined) {
      where.parentId = query.parentId;
    }

    const searchWhere = buildSearchWhere(
      MiscellaneousIncomeService.CATEGORY_SEARCH_FIELDS,
      query.search,
    );
    if (searchWhere) where.AND = [searchWhere];

    const orderBy = resolveSort(
      query.sortBy,
      query.sortOrder,
      MiscellaneousIncomeService.CATEGORY_SORT_FIELDS,
      { name: 'asc' },
    );

    // parent و شمارشِ زیرشاخه‌های «فعال» هم همراه می‌آید تا فرانت بدونِ رفت‌وبرگشتِ اضافه بداند
    // این ردیف مادر است یا زیرشاخه، و آیا ثبتِ عایدی روی آن باید حتماً از یک زیرشاخه بگذرد.
    const result = await paginate(this.prisma.miscellaneousIncomeCategory, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { children: { where: { isActive: true } } } },
      },
    });
    return {
      ...result,
      data: result.data.map((row) => {
        const { _count, ...rest } = row as typeof row & { _count: { children: number } };
        return {
          ...rest,
          activeChildrenCount: _count.children,
          requiresSubcategory: rest.parentId === null && _count.children > 0,
        };
      }),
    };
  }

  async findOneCategory(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const category = await this.findCategoryOrThrow(id);
    this.ensureAccess(actor, category.marketId, 'دسترسی به این دسته‌بندی مجاز نیست');
    return category;
  }

  async updateCategory(
    currentUser: { id: string },
    id: string,
    dto: UpdateMiscellaneousIncomeCategoryDto,
    meta: RequestMeta,
  ) {
    const actor = await this.getActor(currentUser);
    const category = await this.findCategoryOrThrow(id);
    this.ensureAccess(actor, category.marketId, 'دسترسی به این دسته‌بندی مجاز نیست');

    if (dto.parentId !== undefined) {
      throw new BadRequestException(
        'جابه‌جایی کتگوری یا سب‌کتگوری زیر والدِ دیگر ممنوع است؛ سب‌کتگوریِ قدیمی را غیرفعال کنید و در جای درست یکی تازه بسازید',
      );
    }

    if (dto.isActive !== undefined && actor.role !== 'SUPER_ADMIN' && actor.role !== 'ADMIN') {
      throw new ForbiddenException('فعال یا غیرفعال کردنِ کتگوری فقط توسط ادمین ممکن است');
    }

    const data: Prisma.MiscellaneousIncomeCategoryUpdateInput = {};
    if (dto.name !== undefined) {
      const name = cleanName(dto.name);
      if (!name) throw new BadRequestException('نام کتگوری نمی‌تواند خالی باشد');
      await this.assertCategoryNameFree(
        this.prisma,
        { parentId: category.parentId, marketId: category.marketId },
        name,
        id,
      );
      data.name = name;
      data.nameKey = nameKey(name);
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.miscellaneousIncomeCategory.update({ where: { id }, data });
        await this.auditLog.record({
          tx,
          action: 'UPDATE',
          entityType: 'MiscellaneousIncomeCategory',
          entityId: id,
          marketId: category.marketId,
          userId: actor.id,
          oldData: category,
          newData: updated,
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
        return updated;
      });
    } catch (e) {
      this.rethrowDuplicateAsConflict(e);
    }
  }

  async removeCategory(currentUser: { id: string }, id: string, meta: RequestMeta) {
    const actor = await this.getActor(currentUser);
    const category = await this.findCategoryOrThrow(id);
    this.ensureAccess(actor, category.marketId, 'دسترسی به این دسته‌بندی مجاز نیست');

    // وجود (نه تعداد) کافی است: findFirst روی ایندکس، نه شمارشِ همهٔ ردیف‌ها.
    const [hasIncome, hasChild] = await Promise.all([
      this.prisma.miscellaneousIncome.findFirst({ where: { categoryId: id }, select: { id: true } }),
      this.prisma.miscellaneousIncomeCategory.findFirst({ where: { parentId: id }, select: { id: true } }),
    ]);
    if (hasIncome) {
      throw new ConflictException(
        'این دسته‌بندی دارای عایدی ثبت‌شده است و قابل حذف نیست؛ می‌توانید آن را غیرفعال کنید',
      );
    }
    if (hasChild) {
      throw new ConflictException(
        'این کتگوری دارای سب‌کتگوری است و قابل حذف نیست؛ اول سب‌کتگوری‌ها را حذف یا غیرفعال کنید',
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.miscellaneousIncomeCategory.delete({ where: { id } });
        await this.auditLog.record({
          tx,
          action: 'DELETE',
          entityType: 'MiscellaneousIncomeCategory',
          entityId: id,
          marketId: category.marketId,
          userId: actor.id,
          oldData: category,
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
      });
    } catch (e) {
      // بین بررسی و حذف، عایدی/زیرشاخه‌ای ثبت شد — کلید خارجی (Restrict) جلویش را گرفته است.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new ConflictException(
          'هم‌زمان عایدی یا سب‌کتگوری به این دسته‌بندی اضافه شد؛ حذف انجام نشد',
        );
      }
      throw e;
    }

    return { message: `دسته‌بندی «${category.name}» حذف شد` };
  }

  // ==========================================================================
  // عواید متفرقه (MiscellaneousIncome)
  // برعکسِ مصارف: ثبت = موجودیِ حسابِ مقصد «+» و ledger از نوع IN. همان الگوی atomic-ledger که در
  // ExpensesService / AccountsService.transfer استفاده شده.
  // ==========================================================================

  // کتگوری باید متعلق به همان مارکت باشد (دسته‌بندیِ سراسری وجود ندارد).
  // requireActive: فقط وقتی کتگوری «تازه انتخاب» می‌شود (ثبتِ عایدیِ جدید یا عوض‌کردنِ کتگوریِ یک
  // عایدی) — اصلاحِ مبلغ/حسابِ عایدی‌ای که از قبل زیرِ کتگوریِ حالا-غیرفعال ثبت شده باید ممکن بماند.
  private async loadCategoryForMarket(marketId: string, categoryId: string, requireActive: boolean) {
    const category = await this.prisma.miscellaneousIncomeCategory.findUnique({
      where: { id: categoryId },
      include: { parent: { select: { name: true, isActive: true } } },
    });
    if (!category) throw new NotFoundException('دسته‌بندی یافت نشد');
    if (category.marketId !== marketId) {
      throw new BadRequestException('دسته‌بندی باید متعلق به همان بازار باشد');
    }
    if (requireActive) {
      if (!category.isActive) {
        throw new ConflictException(
          `«${category.name}» غیرفعال است و عایدیِ جدید نمی‌پذیرد؛ ادمینِ مارکت باید آن را دوباره فعال کند`,
        );
      }
      if (category.parent && !category.parent.isActive) {
        throw new ConflictException(
          `کتگوریِ مادرِ «${category.parent.name}» غیرفعال است و عایدیِ جدید نمی‌پذیرد؛ ادمینِ مارکت باید آن را دوباره فعال کند`,
        );
      }
    }
    return category;
  }

  private async loadActiveAccountForMarket(marketId: string, accountId: string) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('حساب یافت نشد');
    if (account.marketId !== marketId) {
      throw new BadRequestException('حساب باید متعلق به همان بازار باشد');
    }
    if (!account.isActive) throw new ConflictException('حساب غیرفعال است');
    return account;
  }

  // عایدی باید روی «برگ» ثبت شود: اگر کتگوریِ مادر سب‌کتگوریِ فعال دارد، ثبتِ مستقیم روی خودش
  // ممنوع است — وگرنه عایدی‌ای بدونِ نامِ مورد در گزارش می‌ماند و جمعِ سب‌کتگوری‌ها ناقص می‌شود.
  // مادرِ بدونِ سب‌کتگوریِ فعال (و خودِ سب‌کتگوری) مستقیم عایدی می‌پذیرد. فقط وقتی کتگوری «تازه
  // انتخاب» می‌شود صدا زده می‌شود؛ عایدی‌های قدیمیِ ثبت‌شده روی مادر همچنان قابلِ ویرایش‌اند.
  private async assertCategoryAcceptsIncome(category: {
    id: string;
    name: string;
    parentId: string | null;
  }) {
    if (category.parentId !== null) return;
    const activeChild = await this.prisma.miscellaneousIncomeCategory.findFirst({
      where: { parentId: category.id, isActive: true },
      select: { id: true },
    });
    if (activeChild) {
      throw new BadRequestException(
        `«${category.name}» سب‌کتگوری دارد؛ عایدی را باید روی یکی از سب‌کتگوری‌هایش ثبت کنید (یا با newSubcategoryName یک سب‌کتگوریِ جدید بسازید)`,
      );
    }
  }

  // سب‌کتگوریِ هم‌نامِ فعال → همان؛ غیرفعال → خطا (ادمین باید فعال کند)؛ نبود → ساخته می‌شود.
  // upsert روی کلیدِ یکتا: اگر دو درخواستِ هم‌زمان هم‌نام باشند، دومی ساخته نمی‌شود و همان اولی را می‌گیرد.
  private async getOrCreateSubcategory(
    tx: Prisma.TransactionClient,
    parent: { id: string; marketId: string },
    name: string,
    actor: Actor,
    meta: RequestMeta,
  ) {
    const key = { scopeKey: parent.id, nameKey: nameKey(name) };
    const existing = await tx.miscellaneousIncomeCategory.findUnique({
      where: { scopeKey_nameKey: key },
    });
    if (existing) {
      if (!existing.isActive) {
        throw new ConflictException(
          `سب‌کتگوریِ «${existing.name}» غیرفعال است؛ ادمینِ مارکت باید آن را دوباره فعال کند`,
        );
      }
      return existing;
    }
    const sub = await tx.miscellaneousIncomeCategory.upsert({
      where: { scopeKey_nameKey: key },
      update: {},
      create: {
        marketId: parent.marketId,
        name,
        nameKey: key.nameKey,
        scopeKey: key.scopeKey,
        parentId: parent.id,
      },
    });
    if (!sub.isActive) {
      throw new ConflictException(
        `سب‌کتگوریِ «${sub.name}» غیرفعال است؛ ادمینِ مارکت باید آن را دوباره فعال کند`,
      );
    }
    await this.auditLog.record({
      tx,
      action: 'CREATE',
      entityType: 'MiscellaneousIncomeCategory',
      entityId: sub.id,
      marketId: parent.marketId,
      userId: actor.id,
      newData: sub,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return sub;
  }

  // مبلغ را از موجودیِ حساب کم می‌کند، فقط اگر موجودی کافی باشد (شرطِ balance >= amount داخلِ
  // خودِ UPDATE است، پس بین چک و کم‌کردن هیچ هم‌زمانیِ دیگری فرصت ندارد). موجودی منفی ممنوع است.
  private async debitAccountOrThrow(
    tx: Prisma.TransactionClient,
    accountId: string,
    amount: Prisma.Decimal,
    message: string,
  ) {
    const debited = await tx.account.updateMany({
      where: { id: accountId, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });
    if (debited.count === 0) throw new ConflictException(message);
  }

  private static readonly REVERT_BLOCKED_MESSAGE =
    'موجودیِ حساب برای برگرداندنِ این عایدی کافی نیست — بخشی از این پول قبلاً از حساب خارج (خرج) شده است';

  async createIncome(
    currentUser: { id: string },
    dto: CreateMiscellaneousIncomeDto,
    meta: RequestMeta,
    idempotencyKey?: string,
  ) {
    const actor = await this.getActor(currentUser);
    const marketId = this.resolveMarketId(actor, dto.marketId);

    await ensureMarketSetupComplete(this.prisma, marketId);
    const category = await this.loadCategoryForMarket(marketId, dto.categoryId, true);
    const account = await this.loadActiveAccountForMarket(marketId, dto.accountId);
    const currencyId = account.currencyId;
    await ensureCurrencyEnabledForMarket(this.prisma, marketId, currencyId);

    let newSubName: string | null = null;
    if (dto.newSubcategoryName !== undefined) {
      newSubName = cleanName(dto.newSubcategoryName);
      if (!newSubName) throw new BadRequestException('نامِ سب‌کتگوری نمی‌تواند خالی باشد');
      if (category.parentId !== null) {
        throw new BadRequestException(
          'سب‌کتگوریِ جدید را فقط زیرِ کتگوریِ مادر می‌توان ساخت؛ categoryId باید یک کتگوریِ مادر باشد',
        );
      }
    } else {
      await this.assertCategoryAcceptsIncome(category);
    }

    const amount = new Prisma.Decimal(dto.amount);
    const date = dto.date ? new Date(dto.date) : new Date();
    this.assertDateNotInFuture(date);

    try {
      // Idempotency-Key (اختیاری): ثبتِ عایدی حساب را شارژ می‌کند، پس دابل‌کلیک یا تلاشِ دوبارهٔ
      // شبکه نباید دو بار پول اضافه کند. بدونِ هدر = یک تراکنشِ ساده.
      return await runIdempotent(this.prisma, {
        userId: actor.id,
        scope: 'MISC_INCOME_CREATE',
        key: idempotencyKey,
        requestHash: hashRequest(dto),
        work: async (tx) => {
          let categoryId = category.id;
          if (newSubName) {
            categoryId = (await this.getOrCreateSubcategory(tx, category, newSubName, actor, meta)).id;
          }
          const rootCategoryId = category.parentId ?? category.id;

          const rate = await resolveRateToBase(tx, {
            marketId,
            currencyId,
            date,
            amount,
            manualRate: dto.exchangeRate,
          });

          // update (نه updateMany+read): موجودیِ «بعد از» همین افزایش را اتمیک برمی‌گرداند و تا پایانِ
          // تراکنش روی ردیفِ حساب قفل می‌ماند.
          const updatedAccount = await tx.account.update({
            where: { id: dto.accountId },
            data: { balance: { increment: amount } },
          });

          const income = await tx.miscellaneousIncome.create({
            data: {
              marketId,
              categoryId,
              rootCategoryId,
              amount,
              currencyId,
              accountId: dto.accountId,
              date,
              description: dto.description?.trim() || null,
              exchangeRate: rate.exchangeRate,
              baseCurrencyAmount: rate.baseCurrencyAmount,
              createdById: actor.id,
            },
          });

          await tx.ledgerEntry.create({
            data: {
              marketId,
              accountId: dto.accountId,
              currencyId,
              direction: 'IN',
              amount,
              balanceAfter: updatedAccount.balance,
              exchangeRate: rate.exchangeRate,
              baseCurrencyAmount: rate.baseCurrencyAmount,
              entryDate: date,
              description: `عایدی متفرقه: ${dto.description?.trim() || ''}`.trim(),
              miscellaneousIncomeId: income.id,
              createdById: actor.id,
            },
          });

          // داخلِ همین تراکنش: اگر audit insert شکست بخورد، کلِ عایدی/تغییرِ حساب هم rollback می‌شود.
          await this.auditLog.record({
            tx,
            action: 'CREATE',
            entityType: 'MiscellaneousIncome',
            entityId: income.id,
            marketId,
            userId: actor.id,
            newData: income,
            ip: meta.ip,
            userAgent: meta.userAgent,
          });

          return income;
        },
      });
    } catch (e) {
      this.rethrowDuplicateAsConflict(e);
    }
  }

  async findAllIncomes(currentUser: { id: string }, query: MiscellaneousIncomeQueryDto) {
    const actor = await this.getActor(currentUser);
    const where: Prisma.MiscellaneousIncomeWhereInput = {
      ...this.listMarketFilter(actor, query.marketId),
      ...this.dateRangeWhere(query.fromDate, query.toDate),
    };

    // categoryId مادر باشد → عایدی‌های همهٔ زیرشاخه‌ها هم می‌آید. بدونِ JOIN: rootCategoryId روی خودِ
    // ردیفِ عایدی ذخیره است (برای زیرشاخه، شرطِ rootCategoryId هرگز تطبیق نمی‌دهد و فقط categoryId می‌ماند).
    if (query.categoryId !== undefined) {
      where.OR = [{ categoryId: query.categoryId }, { rootCategoryId: query.categoryId }];
    }
    if (query.accountId !== undefined) where.accountId = query.accountId;
    if (query.currencyId !== undefined) where.currencyId = query.currencyId;

    const searchWhere = buildSearchWhere(
      MiscellaneousIncomeService.INCOME_SEARCH_FIELDS,
      query.search,
    );
    if (searchWhere) where.AND = [searchWhere];

    const orderBy = resolveSort(
      query.sortBy,
      query.sortOrder,
      MiscellaneousIncomeService.INCOME_SORT_FIELDS,
      { date: 'desc' },
    );

    return paginate(this.prisma.miscellaneousIncome, {
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
        createdBy: { select: { id: true, fullName: true } },
      },
    });
  }

  private toCurrencyAmounts(rows: GroupRow[], codeById: Map<string, string>): CurrencyAmount[] {
    return rows
      .map((g) => ({
        currencyId: g.currencyId,
        currencyCode: codeById.get(g.currencyId) ?? null,
        amount: g._sum.amount ?? ZERO,
        amountInBase: g._sum.baseCurrencyAmount ?? ZERO,
        count: g._count,
      }))
      .sort((a, b) => (a.currencyCode ?? '').localeCompare(b.currencyCode ?? ''));
  }

  private async currencyCodes(ids: string[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map<string, string>();
    const currencies = await this.prisma.currency.findMany({
      where: { id: { in: unique } },
      select: { id: true, code: true },
    });
    return new Map(currencies.map((c) => [c.id, c.code]));
  }

  // خلاصهٔ «تاحال/در این بازه چقدر» برای یک کتگوری — یک groupBy روی currencyId (چند ارز را هرگز در
  // یک عدد جمع نمی‌کنیم). برای مادر، rootCategoryId همهٔ زیرشاخه‌ها را بدونِ JOIN می‌گیرد.
  async getIncomeSummary(currentUser: { id: string }, query: MiscellaneousIncomeSummaryQueryDto) {
    const actor = await this.getActor(currentUser);
    const category = await this.findCategoryOrThrow(query.categoryId);
    this.ensureAccess(actor, category.marketId, 'دسترسی به این دسته‌بندی مجاز نیست');

    const where: Prisma.MiscellaneousIncomeWhereInput = {
      marketId: category.marketId,
      OR: [{ categoryId: category.id }, { rootCategoryId: category.id }],
      ...this.dateRangeWhere(query.fromDate, query.toDate),
    };

    const [byCurrency, market, withoutBaseValue] = await Promise.all([
      this.prisma.miscellaneousIncome.groupBy({
        by: ['currencyId'],
        where,
        _sum: { amount: true, baseCurrencyAmount: true },
        _count: true,
      }),
      this.prisma.market.findUnique({
        where: { id: category.marketId },
        select: { baseCurrency: { select: { id: true, code: true } } },
      }),
      this.prisma.miscellaneousIncome.count({ where: { ...where, baseCurrencyAmount: null } }),
    ]);

    const codes = await this.currencyCodes(byCurrency.map((g) => g.currencyId));
    const totals = this.toCurrencyAmounts(byCurrency as GroupRow[], codes);

    return {
      categoryId: category.id,
      categoryName: category.name,
      isParentCategory: category.parentId === null,
      fromDate: query.fromDate ?? null,
      toDate: query.toDate ?? null,
      baseCurrency: market?.baseCurrency ?? null,
      totalsByCurrency: totals.map((t) => ({
        currencyId: t.currencyId,
        currencyCode: t.currencyCode,
        totalAmount: t.amount,
        totalInBase: t.amountInBase,
        count: t.count,
      })),
      totalInBase: totals.reduce((sum, t) => sum.add(t.amountInBase), ZERO),
      // اگر > 0 باشد مجموعِ ارز پایه ناقص است (عایدی‌هایی بدونِ نرخ).
      incomesWithoutBaseValue: withoutBaseValue,
    };
  }

  // تفکیکِ عایدی به دسته‌ها، دو حالت (ن.ک. MiscellaneousIncomeBreakdownQueryDto):
  //  - ریشه‌ها: یک groupBy روی (rootCategoryId, currencyId) در دیتابیس؛ نامِ فقط همان مادرهایی که در
  //    بازه عایدی داشته‌اند خوانده می‌شود، نه همهٔ دسته‌بندی‌های مارکت.
  //  - drill-down (rootCategoryId): ابتدا یک صفحه از زیرشاخه‌ها (ایندکسِ parentId، مرتب با نام)، بعد
  //    فقط برای همان صفحه جمع زده می‌شود. هزینه به تعدادِ کلِ زیرشاخه‌ها بستگی ندارد.
  async getIncomeBreakdown(
    currentUser: { id: string },
    query: MiscellaneousIncomeBreakdownQueryDto,
  ) {
    const actor = await this.getActor(currentUser);
    const marketId = this.resolveMarketId(actor, query.marketId);
    const base: Prisma.MiscellaneousIncomeWhereInput = {
      marketId,
      ...this.dateRangeWhere(query.fromDate, query.toDate),
    };
    const sums = { amount: true, baseCurrencyAmount: true } as const;

    const market = await this.prisma.market.findUnique({
      where: { id: marketId },
      select: { baseCurrency: { select: { id: true, code: true } } },
    });
    const header = {
      marketId,
      fromDate: query.fromDate ?? null,
      toDate: query.toDate ?? null,
      baseCurrency: market?.baseCurrency ?? null,
    };

    if (query.rootCategoryId === undefined) {
      const [grouped, withoutBase] = await Promise.all([
        this.prisma.miscellaneousIncome.groupBy({
          by: ['rootCategoryId', 'currencyId'],
          where: base,
          _sum: sums,
          _count: true,
        }),
        this.prisma.miscellaneousIncome.count({ where: { ...base, baseCurrencyAmount: null } }),
      ]);

      const rootIds = [...new Set(grouped.map((g) => g.rootCategoryId))];
      const [roots, codes] = await Promise.all([
        rootIds.length
          ? this.prisma.miscellaneousIncomeCategory.findMany({
              where: { id: { in: rootIds } },
              select: { id: true, name: true },
            })
          : Promise.resolve([]),
        this.currencyCodes(grouped.map((g) => g.currencyId)),
      ]);
      const nameById = new Map(roots.map((r) => [r.id, r.name]));

      const byRoot = new Map<string, GroupRow[]>();
      for (const g of grouped) {
        const list = byRoot.get(g.rootCategoryId) ?? [];
        list.push(g as GroupRow);
        byRoot.set(g.rootCategoryId, list);
      }
      const categories = [...byRoot.entries()]
        .map(([categoryId, rows]) => {
          const total = this.toCurrencyAmounts(rows, codes);
          return {
            categoryId,
            name: nameById.get(categoryId) ?? null,
            total,
            totalInBase: total.reduce((s, t) => s.add(t.amountInBase), ZERO),
          };
        })
        .sort((a, b) => b.totalInBase.comparedTo(a.totalInBase) || (a.name ?? '').localeCompare(b.name ?? ''));

      const byCurrency = new Map<string, GroupRow>();
      for (const g of grouped) {
        const cur = byCurrency.get(g.currencyId) ?? {
          currencyId: g.currencyId,
          _sum: { amount: ZERO, baseCurrencyAmount: ZERO },
          _count: 0,
        };
        cur._sum.amount = (cur._sum.amount ?? ZERO).add(g._sum.amount ?? ZERO);
        cur._sum.baseCurrencyAmount = (cur._sum.baseCurrencyAmount ?? ZERO).add(
          g._sum.baseCurrencyAmount ?? ZERO,
        );
        cur._count += g._count;
        byCurrency.set(g.currencyId, cur);
      }
      const grandTotal = this.toCurrencyAmounts([...byCurrency.values()], codes);

      return {
        ...header,
        grandTotal,
        grandTotalInBase: grandTotal.reduce((s, t) => s.add(t.amountInBase), ZERO),
        incomesWithoutBaseValue: withoutBase,
        categories,
      };
    }

    // ---- drill-down زیرِ یک کتگوریِ مادر ----
    const root = await this.findCategoryOrThrow(query.rootCategoryId);
    if (root.marketId !== marketId) {
      throw new BadRequestException('دسته‌بندی باید متعلق به همان بازار باشد');
    }
    if (root.parentId !== null) {
      throw new BadRequestException('rootCategoryId باید یک کتگوریِ مادر باشد، نه سب‌کتگوری');
    }

    const subWhere: Prisma.MiscellaneousIncomeCategoryWhereInput = { parentId: root.id };
    const searchWhere = buildSearchWhere(
      MiscellaneousIncomeService.CATEGORY_SEARCH_FIELDS,
      query.search,
    );
    if (searchWhere) subWhere.AND = [searchWhere];

    const subPage = await paginate(this.prisma.miscellaneousIncomeCategory, {
      where: subWhere,
      orderBy: { name: 'asc' },
      page: query.page,
      limit: query.limit,
      select: { id: true, name: true, isActive: true },
    });
    const subIds = subPage.data.map((s) => s.id);

    const [subGrouped, directGrouped, rootGrouped, withoutBase] = await Promise.all([
      subIds.length
        ? this.prisma.miscellaneousIncome.groupBy({
            by: ['categoryId', 'currencyId'],
            where: { ...base, categoryId: { in: subIds } },
            _sum: sums,
            _count: true,
          })
        : Promise.resolve([]),
      this.prisma.miscellaneousIncome.groupBy({
        by: ['currencyId'],
        where: { ...base, categoryId: root.id },
        _sum: sums,
        _count: true,
      }),
      this.prisma.miscellaneousIncome.groupBy({
        by: ['currencyId'],
        where: { ...base, rootCategoryId: root.id },
        _sum: sums,
        _count: true,
      }),
      this.prisma.miscellaneousIncome.count({
        where: { ...base, rootCategoryId: root.id, baseCurrencyAmount: null },
      }),
    ]);

    const codes = await this.currencyCodes([
      ...subGrouped.map((g) => g.currencyId),
      ...directGrouped.map((g) => g.currencyId),
      ...rootGrouped.map((g) => g.currencyId),
    ]);
    const bySub = new Map<string, GroupRow[]>();
    for (const g of subGrouped) {
      const list = bySub.get(g.categoryId) ?? [];
      list.push(g as GroupRow);
      bySub.set(g.categoryId, list);
    }

    return {
      ...header,
      root: {
        categoryId: root.id,
        name: root.name,
        // عایدی‌هایی که مستقیم روی خودِ مادر ثبت شده (مادرِ بدونِ زیرشاخه / عایدی‌های قدیمی).
        direct: this.toCurrencyAmounts(directGrouped as GroupRow[], codes),
        // مجموعِ مادر + همهٔ زیرشاخه‌ها (نه فقط این صفحه).
        total: this.toCurrencyAmounts(rootGrouped as GroupRow[], codes),
      },
      incomesWithoutBaseValue: withoutBase,
      subcategories: {
        data: subPage.data.map((s) => ({
          categoryId: s.id,
          name: s.name,
          isActive: s.isActive,
          total: this.toCurrencyAmounts(bySub.get(s.id) ?? [], codes),
        })),
        meta: subPage.meta,
      },
    };
  }

  private async findIncomeOrThrow(id: string) {
    const income = await this.prisma.miscellaneousIncome.findUnique({ where: { id } });
    if (!income) throw new NotFoundException('عایدی یافت نشد');
    return income;
  }

  async findOneIncome(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const income = await this.findIncomeOrThrow(id);
    this.ensureAccess(actor, income.marketId, 'دسترسی به این عایدی مجاز نیست');

    return this.prisma.miscellaneousIncome.findUnique({
      where: { id },
      include: {
        category: {
          select: { id: true, name: true, parent: { select: { id: true, name: true } } },
        },
        account: { select: { id: true, name: true } },
        currency: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async updateIncome(
    currentUser: { id: string },
    id: string,
    dto: UpdateMiscellaneousIncomeDto,
    meta: RequestMeta,
  ) {
    const actor = await this.getActor(currentUser);
    const income = await this.findIncomeOrThrow(id);
    this.ensureAccess(actor, income.marketId, 'دسترسی به این عایدی مجاز نیست');

    const nextAmount = dto.amount !== undefined ? new Prisma.Decimal(dto.amount) : income.amount;
    const nextAccountId = dto.accountId ?? income.accountId;
    const accountChanged = nextAccountId !== income.accountId;
    const moneyChanged =
      !nextAmount.equals(income.amount) || accountChanged || dto.exchangeRate !== undefined;

    // تصحیحِ مبلغ/حساب/نرخِ یک عایدیِ ثبت‌شده باید یک دلیلِ مکتوب داشته باشد — برای audit trail.
    if (moneyChanged && !dto.reason?.trim()) {
      throw new BadRequestException('برای تغییرِ مبلغ، حساب یا نرخِ عایدی، ذکرِ دلیل الزامی است');
    }

    const data: Prisma.MiscellaneousIncomeUncheckedUpdateManyInput = {};

    const categoryChanged = dto.categoryId !== undefined && dto.categoryId !== income.categoryId;
    if (categoryChanged) {
      const category = await this.loadCategoryForMarket(income.marketId, dto.categoryId!, true);
      await this.assertCategoryAcceptsIncome(category);
      data.categoryId = category.id;
      data.rootCategoryId = category.parentId ?? category.id;
    }

    // ارز همیشه از رویِ حسابِ (جدید/فعلیِ) عایدی مشتق می‌شود، نه از ورودیِ کاربر.
    let nextCurrencyId = income.currencyId;
    if (moneyChanged) {
      const account = await this.loadActiveAccountForMarket(income.marketId, nextAccountId);
      nextCurrencyId = account.currencyId;
    }

    if (dto.date !== undefined) {
      const date = new Date(dto.date);
      if (date.getTime() !== income.date.getTime()) this.assertDateNotInFuture(date);
      data.date = date;
    }
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;

    try {
      if (!moneyChanged) {
        return await this.prisma.$transaction(async (tx) => {
          const updated = await tx.miscellaneousIncome.update({
            where: { id },
            data: data as Prisma.MiscellaneousIncomeUncheckedUpdateInput,
          });
          // تاریخ و توضیح روی ردیفِ دفترکل هم باید بنشیند، وگرنه گزارش‌های مبتنی بر دفترکل (داشبورد،
          // صورت‌حساب) عایدی را در تاریخِ قدیمی می‌بینند. updateMany: برای ردیفِ بدونِ ledger خطا نمی‌دهد.
          if (dto.date !== undefined || dto.description !== undefined) {
            await tx.ledgerEntry.updateMany({
              where: { miscellaneousIncomeId: id },
              data: {
                entryDate: updated.date,
                description: `عایدی متفرقه: ${updated.description ?? ''}`.trim(),
              },
            });
          }
          await this.auditLog.record({
            tx,
            action: 'UPDATE',
            entityType: 'MiscellaneousIncome',
            entityId: id,
            marketId: income.marketId,
            userId: actor.id,
            oldData: income,
            newData: updated,
            reason: dto.reason,
            ip: meta.ip,
            userAgent: meta.userAgent,
          });
          return updated;
        });
      }

      // مبلغ/حساب/نرخ عوض شده: اثرِ قدیمی برگردانده (حساب قدیم «−»)، اثرِ جدید اعمال (حساب جدید «+») —
      // همه در یک تراکنش تا حساب هیچ‌وقت در حالتِ میانه دیده نشود.
      return await this.prisma.$transaction(async (tx) => {
        // عایدیِ قدیمی که ردیفِ دفترکل ندارد: معلوم نیست پولش هرگز به حساب اضافه شده یا نه، پس
        // برگرداندنش می‌تواند موجودی را خراب کند — رد می‌شود تا ادمین دستی بررسی کند.
        const ledger = await tx.ledgerEntry.findUnique({
          where: { miscellaneousIncomeId: id },
          select: { id: true },
        });
        if (!ledger) {
          throw new ConflictException(
            'این عایدی ردیفِ دفترکل ندارد (ثبتِ قدیمی)؛ مبلغ/حسابش با این API قابلِ تغییر نیست',
          );
        }

        // نرخِ ثبت‌شدهٔ همین عایدی حفظ می‌شود (فقط معادلِ ارز پایه با مبلغِ جدید دوباره حساب می‌شود)،
        // مگر نرخِ دستیِ جدید بیاید، ارز عوض شود، یا عایدیِ قدیمی نرخ نداشته باشد.
        const rate =
          dto.exchangeRate === undefined &&
          income.exchangeRate &&
          nextCurrencyId === income.currencyId
            ? {
                exchangeRate: income.exchangeRate,
                baseCurrencyAmount: nextAmount.mul(income.exchangeRate).toDecimalPlaces(4),
              }
            : await resolveRateToBase(tx, {
                marketId: income.marketId,
                currencyId: nextCurrencyId,
                date: (data.date as Date | undefined) ?? income.date,
                amount: nextAmount,
                manualRate: dto.exchangeRate,
              });

        // قفلِ خوش‌بینانه: اگر این عایدی از لحظهٔ خواندن توسط ویرایشِ هم‌زمانِ دیگری تغییر کرده باشد،
        // count=0 می‌شود و خطا می‌دهیم، به‌جای اینکه دو ویرایش هر دو مبلغِ قدیمیِ یکسان را از حساب کم کنند.
        const guarded = await tx.miscellaneousIncome.updateMany({
          where: { id, amount: income.amount, accountId: income.accountId },
          data: {
            ...data,
            amount: nextAmount,
            accountId: nextAccountId,
            currencyId: nextCurrencyId,
            exchangeRate: rate.exchangeRate,
            baseCurrencyAmount: rate.baseCurrencyAmount,
          },
        });
        if (guarded.count === 0) {
          throw new ConflictException(
            'این عایدی هم‌زمان توسط کاربرِ دیگری ویرایش شده — صفحه را رفرش و دوباره تلاش کنید',
          );
        }

        if (!accountChanged) {
          // یک حساب: فقط تفاضل. کاهش = برگرداندنِ بخشی از پول (باید در حساب باشد)؛ افزایش همیشه ممکن است.
          const delta = nextAmount.sub(income.amount);
          if (delta.isNegative()) {
            await this.debitAccountOrThrow(
              tx,
              income.accountId,
              delta.abs(),
              MiscellaneousIncomeService.REVERT_BLOCKED_MESSAGE,
            );
          } else if (!delta.isZero()) {
            await tx.account.update({
              where: { id: income.accountId },
              data: { balance: { increment: delta } },
            });
          }
        } else {
          // دو حساب: از قدیمی «−» (با چکِ موجودی) و به جدید «+». ترتیبِ قفلِ ردیف‌ها بر اساسِ id ثابت
          // است تا دو ویرایشِ هم‌زمانِ معکوس به deadlock نخورند.
          const steps = [
            { id: income.accountId, kind: 'debit' as const, amount: income.amount },
            { id: nextAccountId, kind: 'credit' as const, amount: nextAmount },
          ].sort((a, b) => (a.id < b.id ? -1 : 1));
          for (const step of steps) {
            if (step.kind === 'debit') {
              await this.debitAccountOrThrow(
                tx,
                step.id,
                step.amount,
                MiscellaneousIncomeService.REVERT_BLOCKED_MESSAGE,
              );
            } else {
              await tx.account.update({
                where: { id: step.id },
                data: { balance: { increment: step.amount } },
              });
            }
          }
        }

        const [finalAccount, updatedIncome] = await Promise.all([
          tx.account.findUniqueOrThrow({ where: { id: nextAccountId }, select: { balance: true } }),
          tx.miscellaneousIncome.findUniqueOrThrow({ where: { id } }),
        ]);

        await tx.ledgerEntry.update({
          where: { miscellaneousIncomeId: id },
          data: {
            accountId: nextAccountId,
            currencyId: nextCurrencyId,
            amount: nextAmount,
            balanceAfter: finalAccount.balance,
            exchangeRate: rate.exchangeRate,
            baseCurrencyAmount: rate.baseCurrencyAmount,
            entryDate: updatedIncome.date,
            description: `عایدی متفرقه: ${updatedIncome.description ?? ''}`.trim(),
          },
        });

        await this.auditLog.record({
          tx,
          action: 'UPDATE',
          entityType: 'MiscellaneousIncome',
          entityId: id,
          marketId: income.marketId,
          userId: actor.id,
          oldData: income,
          newData: updatedIncome,
          reason: dto.reason,
          ip: meta.ip,
          userAgent: meta.userAgent,
        });

        return updatedIncome;
      });
    } catch (e) {
      this.rethrowDuplicateAsConflict(e);
    }
  }

  // حذفِ عایدی = برگرداندنِ کاملِ اثرش: مبلغ از حساب «کم» می‌شود (به شرطِ اینکه هنوز در حساب باشد)
  // و ردیفِ دفترکل با cascade پاک می‌شود. برخلافِ حذفِ مصرف (که پول به حساب برمی‌گردد و همیشه امن
  // است)، اینجا اگر پول خرج شده باشد حذف رد می‌شود تا موجودی هرگز منفی نشود.
  async removeIncome(
    currentUser: { id: string },
    id: string,
    dto: RemoveMiscellaneousIncomeDto,
    meta: RequestMeta,
  ) {
    const actor = await this.getActor(currentUser);
    const income = await this.findIncomeOrThrow(id);
    this.ensureAccess(actor, income.marketId, 'دسترسی به این عایدی مجاز نیست');

    const reason = dto.reason?.trim();
    if (!reason) throw new BadRequestException('برای حذفِ عایدی، ذکرِ دلیل الزامی است');

    await this.prisma.$transaction(async (tx) => {
      const ledger = await tx.ledgerEntry.findUnique({
        where: { miscellaneousIncomeId: id },
        select: { id: true },
      });
      if (!ledger) {
        throw new ConflictException(
          'این عایدی ردیفِ دفترکل ندارد (ثبتِ قدیمی)؛ با این API قابلِ حذف نیست',
        );
      }

      // اول خودِ عایدی حذف می‌شود (اگر هم‌زمان با ویرایش/حذفِ دیگری بود، count=0 و هیچ پولی کم نمی‌شود).
      const deleted = await tx.miscellaneousIncome.deleteMany({
        where: { id, amount: income.amount, accountId: income.accountId },
      });
      if (deleted.count === 0) {
        throw new ConflictException(
          'این عایدی هم‌زمان توسط کاربرِ دیگری تغییر کرده یا حذف شده — صفحه را رفرش کنید',
        );
      }
      await this.debitAccountOrThrow(
        tx,
        income.accountId,
        income.amount,
        MiscellaneousIncomeService.REVERT_BLOCKED_MESSAGE,
      );

      await this.auditLog.record({
        tx,
        action: 'DELETE',
        entityType: 'MiscellaneousIncome',
        entityId: id,
        marketId: income.marketId,
        userId: actor.id,
        oldData: income,
        reason,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    });

    return { message: 'عایدی حذف شد و مبلغش از حساب کم شد' };
  }
}
