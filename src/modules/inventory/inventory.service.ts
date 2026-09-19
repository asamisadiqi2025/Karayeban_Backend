import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Account, InventoryTransactionType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ensureMarketSetupComplete } from '../../common/utils/ensure-market-setup-complete';
import { ensureCurrencyEnabledForMarket } from '../../common/utils/ensure-currency-enabled-for-market';
import {
  paginate,
  resolveSort,
  buildSearchWhere,
} from '../../common/utils/pagination';
import { CreateInventoryCategoryDto } from './dto/create-inventory-category.dto';
import { UpdateInventoryCategoryDto } from './dto/update-inventory-category.dto';
import { InventoryCategoryQueryDto } from './dto/inventory-category-query.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { InventoryItemQueryDto } from './dto/inventory-item-query.dto';
import { InventoryItemSummaryQueryDto } from './dto/inventory-item-summary-query.dto';
import { CreateInventoryTransactionDto } from './dto/create-inventory-transaction.dto';
import { InventoryTransactionQueryDto } from './dto/inventory-transaction-query.dto';
import { StockStatementQueryDto } from './dto/stock-statement-query.dto';

type Actor = { id: string; role: string; marketId: string | null };

const MONEY_TYPES: InventoryTransactionType[] = [
  InventoryTransactionType.PURCHASE,
  InventoryTransactionType.SALE,
];

// هر سه زیربخش (دسته‌بندی، کالا، تراکنش خرید/فروش/مصرف/اصلاح) در یک فایل، دقیقاً مثل
// ShareholdersService که سهام‌دار + سهم + تراکنش را یک‌جا نگه می‌دارد — نه سه فایل جدا.
// Warehouse از این فایل بیرون است چون مفهوماً یک «مکان فیزیکی» مستقل است، نه بخشی از
// چرخهٔ خودِ کالا.
@Injectable()
export class InventoryService {
  private static readonly CATEGORY_SORT_FIELDS = ['name', 'createdAt'] as const;
  private static readonly CATEGORY_SEARCH_FIELDS = ['name'] as const;
  private static readonly ITEM_SORT_FIELDS = [
    'name',
    'quantity',
    'averageCost',
    'createdAt',
  ] as const;
  private static readonly ITEM_SEARCH_FIELDS = ['name'] as const;
  private static readonly TRANSACTION_SORT_FIELDS = [
    'transactionDate',
    'createdAt',
  ] as const;

  constructor(private readonly prisma: PrismaService) {}

  // JWT در حال حاضر marketId را حمل نمی‌کند، پس همیشه از دیتابیس تازه خوانده می‌شود.
  private async getActor(currentUser: { id: string }): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, role: true, marketId: true },
    });
    if (!user) throw new ForbiddenException('کاربر معتبر نیست');
    return user;
  }

  // entityMarketId خالی = مورد سراسری (فقط دسته‌بندی چنین حالتی دارد) — فقط SUPER_ADMIN
  // به آن دسترسی دارد.
  private ensureAccess(
    actor: Actor,
    entityMarketId: string | null,
    message: string,
  ) {
    if (actor.role === 'SUPER_ADMIN') return;
    if (entityMarketId === null || actor.marketId !== entityMarketId) {
      throw new ForbiddenException(message);
    }
  }

  private resolveMarketId(
    actor: Actor,
    providedMarketId: string | undefined,
  ): string {
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
  // دسته‌بندی‌های کالا (InventoryCategory)
  // marketId خالی = دسته‌بندی سراسری (قابل‌استفاده برای همهٔ بازارها)، دقیقاً مثل
  // ExpenseCategory. فقط SUPER_ADMIN می‌تواند دسته‌بندی سراسری بسازد/ویرایش کند؛ نقش‌های
  // دیگر همیشه دسته‌بندیِ مخصوص بازار خودشان را می‌سازند و فقط همان‌ها (+ سراسری‌ها) را می‌بینند.
  // ==========================================================================

  private async findCategoryOrThrow(id: string) {
    const category = await this.prisma.inventoryCategory.findUnique({
      where: { id },
    });
    if (!category) throw new NotFoundException('دسته‌بندی یافت نشد');
    return category;
  }

  async createCategory(
    currentUser: { id: string },
    dto: CreateInventoryCategoryDto,
  ) {
    const actor = await this.getActor(currentUser);
    const marketId =
      actor.role === 'SUPER_ADMIN' ? (dto.marketId ?? null) : actor.marketId;
    if (marketId === null && actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }

    return this.prisma.inventoryCategory.create({
      data: { marketId, name: dto.name.trim() },
    });
  }

  async findAllCategories(
    currentUser: { id: string },
    query: InventoryCategoryQueryDto,
  ) {
    const actor = await this.getActor(currentUser);
    const where: any =
      actor.role === 'SUPER_ADMIN'
        ? {}
        : { OR: [{ marketId: null }, { marketId: actor.marketId }] };

    if (query.isActive !== undefined) where.isActive = query.isActive;

    const searchWhere = buildSearchWhere(
      InventoryService.CATEGORY_SEARCH_FIELDS,
      query.search,
    );
    if (searchWhere) where.AND = [searchWhere];

    const orderBy = resolveSort(
      query.sortBy,
      query.sortOrder,
      InventoryService.CATEGORY_SORT_FIELDS,
      { name: 'asc' },
    );

    return paginate(this.prisma.inventoryCategory, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
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

  async updateCategory(
    currentUser: { id: string },
    id: string,
    dto: UpdateInventoryCategoryDto,
  ) {
    const actor = await this.getActor(currentUser);
    const category = await this.findCategoryOrThrow(id);
    this.ensureAccess(
      actor,
      category.marketId,
      'دسترسی به این دسته‌بندی مجاز نیست',
    );

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.inventoryCategory.update({ where: { id }, data });
  }

  async removeCategory(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const category = await this.findCategoryOrThrow(id);
    this.ensureAccess(
      actor,
      category.marketId,
      'دسترسی به این دسته‌بندی مجاز نیست',
    );

    const itemsCount = await this.prisma.inventoryItem.count({
      where: { categoryId: id, isDeleted: false },
    });
    if (itemsCount > 0) {
      throw new ConflictException(
        'این دسته‌بندی دارای کالای ثبت‌شده است و قابل حذف نیست؛ می‌توانید آن را غیرفعال کنید',
      );
    }

    await this.prisma.inventoryCategory.delete({ where: { id } });
    return { message: `دسته‌بندی «${category.name}» حذف شد` };
  }

  // ==========================================================================
  // کالاهای گدام (InventoryItem)
  // quantity/averageCost جمع دائمیِ اتمیک هستند (مثل Account.balance) — فقط از طریق
  // createTransaction تغییر می‌کنند، هیچ‌وقت مستقیم از updateItem.
  // ==========================================================================

  private async findItemActiveOrThrow(id: string) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item || item.isDeleted) throw new NotFoundException('کالا یافت نشد');
    return item;
  }

  async createItem(currentUser: { id: string }, dto: CreateInventoryItemDto) {
    const actor = await this.getActor(currentUser);
    const marketId = this.resolveMarketId(actor, dto.marketId);

    await ensureMarketSetupComplete(this.prisma, marketId);

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });
    if (!warehouse || warehouse.isDeleted)
      throw new NotFoundException('گدام یافت نشد');
    if (warehouse.marketId !== marketId) {
      throw new BadRequestException('گدام باید متعلق به همان بازار باشد');
    }

    if (dto.categoryId !== undefined) {
      const category = await this.prisma.inventoryCategory.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) throw new NotFoundException('دسته‌بندی یافت نشد');
      if (category.marketId !== null && category.marketId !== marketId) {
        throw new BadRequestException(
          'دسته‌بندی باید سراسری یا متعلق به همان بازار باشد',
        );
      }
    }

    const currency = await this.prisma.currency.findUnique({
      where: { id: dto.currencyId },
    });
    if (!currency) throw new NotFoundException('ارز مورد نظر یافت نشد');
    await ensureCurrencyEnabledForMarket(this.prisma, marketId, dto.currencyId);

    const openingQuantity = dto.openingStock
      ? new Prisma.Decimal(dto.openingStock.quantity)
      : new Prisma.Decimal(0);
    const openingUnitCost = dto.openingStock
      ? new Prisma.Decimal(dto.openingStock.unitCost)
      : new Prisma.Decimal(0);
    const openingDate = dto.openingStock?.date
      ? new Date(dto.openingStock.date)
      : new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const item = await tx.inventoryItem.create({
          data: {
            marketId,
            warehouseId: dto.warehouseId,
            categoryId: dto.categoryId ?? null,
            name: dto.name.trim(),
            unit: dto.unit.trim(),
            currencyId: dto.currencyId,
            details: dto.details?.trim() || null,
            quantity: openingQuantity,
            averageCost: openingUnitCost,
          },
        });

        // دقیقاً مثل OpeningBalance برای Account: یک رویداد ADJUSTMENT برای تاریخچه
        // ساخته می‌شود تا موجودی افتتاحیه هم مثل هر تغییر موجودی دیگر ردیابی بماند.
        if (dto.openingStock) {
          await tx.inventoryTransaction.create({
            data: {
              marketId,
              warehouseId: dto.warehouseId,
              itemId: item.id,
              type: InventoryTransactionType.ADJUSTMENT,
              quantity: openingQuantity,
              totalAmount: openingQuantity.mul(openingUnitCost),
              accountId: null,
              currencyId: dto.currencyId,
              transactionDate: openingDate,
              notes: dto.openingStock.notes?.trim() || 'موجودی افتتاحیهٔ کالا',
              createdById: actor.id,
            },
          });
        }

        return item;
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException(
          'کالایی با همین نام در این گدام قبلاً ثبت شده است',
        );
      }
      throw e;
    }
  }

  async findAllItems(
    currentUser: { id: string },
    query: InventoryItemQueryDto,
  ) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }
    const where: any = {
      isDeleted: false,
      ...(actor.role === 'SUPER_ADMIN' ? {} : { marketId: actor.marketId! }),
    };

    if (query.warehouseId !== undefined) where.warehouseId = query.warehouseId;
    if (query.categoryId !== undefined) where.categoryId = query.categoryId;
    if (query.currencyId !== undefined) where.currencyId = query.currencyId;
    if (query.isActive !== undefined) where.isActive = query.isActive;

    const searchWhere = buildSearchWhere(
      InventoryService.ITEM_SEARCH_FIELDS,
      query.search,
    );
    if (searchWhere) where.AND = [searchWhere];

    const orderBy = resolveSort(
      query.sortBy,
      query.sortOrder,
      InventoryService.ITEM_SORT_FIELDS,
      {
        name: 'asc',
      },
    );

    return paginate(this.prisma.inventoryItem, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      include: {
        warehouse: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        currency: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async findOneItem(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const item = await this.findItemActiveOrThrow(id);
    this.ensureAccess(actor, item.marketId, 'دسترسی به این کالا مجاز نیست');

    return this.prisma.inventoryItem.findUnique({
      where: { id },
      include: {
        warehouse: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        currency: { select: { id: true, code: true, name: true } },
        transactions: { orderBy: { transactionDate: 'desc' }, take: 20 },
      },
    });
  }

  async updateItem(
    currentUser: { id: string },
    id: string,
    dto: UpdateInventoryItemDto,
  ) {
    const actor = await this.getActor(currentUser);
    const item = await this.findItemActiveOrThrow(id);
    this.ensureAccess(actor, item.marketId, 'دسترسی به این کالا مجاز نیست');

    if (dto.warehouseId !== undefined && dto.warehouseId !== item.warehouseId) {
      const warehouse = await this.prisma.warehouse.findUnique({
        where: { id: dto.warehouseId },
      });
      if (!warehouse || warehouse.isDeleted)
        throw new NotFoundException('گدام یافت نشد');
      if (warehouse.marketId !== item.marketId) {
        throw new BadRequestException(
          'گدام باید متعلق به همان بازارِ کالا باشد',
        );
      }
    }

    if (dto.categoryId !== undefined && dto.categoryId !== item.categoryId) {
      const category = await this.prisma.inventoryCategory.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) throw new NotFoundException('دسته‌بندی یافت نشد');
      if (category.marketId !== null && category.marketId !== item.marketId) {
        throw new BadRequestException(
          'دسته‌بندی باید سراسری یا متعلق به همان بازارِ کالا باشد',
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.unit !== undefined) data.unit = dto.unit.trim();
    if (dto.warehouseId !== undefined) data.warehouseId = dto.warehouseId;
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.details !== undefined) data.details = dto.details?.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      return await this.prisma.inventoryItem.update({ where: { id }, data });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException(
          'کالایی با همین نام در این گدام قبلاً ثبت شده است',
        );
      }
      throw e;
    }
  }

  async removeItem(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const item = await this.findItemActiveOrThrow(id);
    this.ensureAccess(actor, item.marketId, 'دسترسی به این کالا مجاز نیست');

    if (item.quantity.greaterThan(0)) {
      throw new ConflictException(
        'موجودی این کالا صفر نیست و قابل حذف نیست؛ ابتدا با یک تراکنش فروش/مصرف/اصلاح موجودی را صفر کنید',
      );
    }

    await this.prisma.inventoryItem.update({
      where: { id },
      data: { isDeleted: true },
    });
    return { message: `کالای «${item.name}» حذف شد` };
  }

  // مجموع ارزش موجودی — جدا برای هر ارز و هر گدام (چون qty×averageCost در سطح دیتابیس
  // با groupBy._sum قابل جمع نیست، ردیف‌ها خوانده و در همین سرویس جمع می‌شوند).
  async getItemsSummary(
    currentUser: { id: string },
    query: InventoryItemSummaryQueryDto,
  ) {
    const actor = await this.getActor(currentUser);

    let marketId: string | undefined;
    if (actor.role === 'SUPER_ADMIN') {
      marketId = query.marketId;
    } else {
      if (!actor.marketId) {
        throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
      }
      marketId = actor.marketId;
    }

    const where: any = {
      isDeleted: false,
      ...(marketId ? { marketId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
    };

    const items = await this.prisma.inventoryItem.findMany({
      where,
      select: {
        quantity: true,
        averageCost: true,
        currencyId: true,
        warehouseId: true,
      },
    });

    const currencies = await this.prisma.currency.findMany({
      where: { id: { in: [...new Set(items.map((i) => i.currencyId))] } },
      select: { id: true, code: true, name: true },
    });
    const currencyById = new Map(currencies.map((c) => [c.id, c]));

    const groups = new Map<
      string,
      {
        currencyId: string;
        warehouseId: string;
        itemCount: number;
        totalValue: Prisma.Decimal;
      }
    >();
    for (const item of items) {
      const key = `${item.currencyId}:${item.warehouseId}`;
      const value = item.quantity.mul(item.averageCost);
      const existing = groups.get(key);
      if (existing) {
        existing.itemCount += 1;
        existing.totalValue = existing.totalValue.add(value);
      } else {
        groups.set(key, {
          currencyId: item.currencyId,
          warehouseId: item.warehouseId,
          itemCount: 1,
          totalValue: value,
        });
      }
    }

    return {
      marketId: marketId ?? null,
      totalItems: items.length,
      byWarehouseAndCurrency: [...groups.values()].map((g) => ({
        warehouseId: g.warehouseId,
        currencyId: g.currencyId,
        currencyCode: currencyById.get(g.currencyId)?.code ?? null,
        currencyName: currencyById.get(g.currencyId)?.name ?? null,
        itemCount: g.itemCount,
        totalValue: g.totalValue,
      })),
    };
  }

  // مؤثرترین علامت هر نوع تراکنش روی موجودی: PURCHASE مثبت، ADJUSTMENT از قبل با علامت
  // درست ذخیره شده (مثبت/منفی)، SALE/CONSUMPTION در دیتابیس مثبت ذخیره می‌شوند ولی اثرشان
  // منفی است — دقیقاً همان قانونی که createTransaction برای افزایش/کاهش quantity دارد.
  private effectOfType(
    type: InventoryTransactionType,
    qty: Prisma.Decimal,
  ): Prisma.Decimal {
    if (
      type === InventoryTransactionType.SALE ||
      type === InventoryTransactionType.CONSUMPTION
    ) {
      return qty.neg();
    }
    return qty;
  }

  // موجودی اول دوره (جمع اثرِ همهٔ تراکنش‌های قبل از from) + جمع هر نوع تراکنش در [from, to]
  // + موجودی آخر دوره. فقط خواندنی و تجمیعی (groupBy در سطح دیتابیس) — هیچ ردیفی خوانده
  // یا تغییر داده نمی‌شود، پس نمی‌تواند روی بخش‌های دیگر (خرید/فروش/مصرف/اصلاح) اثر بگذارد.
  private async computeItemStatement(
    item: { id: string; name: string; unit: string; currencyId: string },
    from: Date,
    toExclusive: Date,
  ) {
    const openingAgg = await this.prisma.inventoryTransaction.groupBy({
      by: ['type'],
      where: { itemId: item.id, transactionDate: { lt: from } },
      _sum: { quantity: true },
    });
    const openingBalance = openingAgg.reduce(
      (sum, g) =>
        sum.add(
          this.effectOfType(g.type, g._sum.quantity ?? new Prisma.Decimal(0)),
        ),
      new Prisma.Decimal(0),
    );

    const periodAgg = await this.prisma.inventoryTransaction.groupBy({
      by: ['type'],
      where: {
        itemId: item.id,
        transactionDate: { gte: from, lt: toExclusive },
      },
      _sum: { quantity: true, totalAmount: true, costOfGoodsSold: true },
    });

    const zero = new Prisma.Decimal(0);
    const byType = (type: InventoryTransactionType) => {
      const g = periodAgg.find((x) => x.type === type);
      return {
        quantity: g?._sum.quantity ?? zero,
        amount: g?._sum.totalAmount ?? zero,
        costOfGoodsSold: g?._sum.costOfGoodsSold ?? zero,
      };
    };

    const purchased = byType(InventoryTransactionType.PURCHASE);
    const sold = byType(InventoryTransactionType.SALE);
    const consumed = byType(InventoryTransactionType.CONSUMPTION);
    const adjusted = byType(InventoryTransactionType.ADJUSTMENT);

    const netEffect = purchased.quantity
      .sub(sold.quantity)
      .sub(consumed.quantity)
      .add(adjusted.quantity); // adjusted.quantity از قبل با علامت درست است

    return {
      itemId: item.id,
      itemName: item.name,
      unit: item.unit,
      currencyId: item.currencyId,
      openingBalance,
      purchased: { quantity: purchased.quantity, amount: purchased.amount },
      sold: {
        quantity: sold.quantity,
        amount: sold.amount,
        costOfGoodsSold: sold.costOfGoodsSold,
      },
      consumed: { quantity: consumed.quantity, amount: consumed.amount },
      adjusted: { quantity: adjusted.quantity, amount: adjusted.amount },
      closingBalance: openingBalance.add(netEffect),
    };
  }

  // گزارش دورهٔ موجودی، مثل صورت‌حساب بانکی — یا برای یک کالای مشخص (itemId)، یا برای
  // همهٔ کالاهای فعالِ یک گدام یک‌جا (warehouseId). دقیقاً یکی از این دو باید داده شود
  // (در DTO چک می‌شود).
  async getStockStatement(
    currentUser: { id: string },
    query: StockStatementQueryDto,
  ) {
    const actor = await this.getActor(currentUser);

    const from = new Date(query.from);
    const to = new Date(query.to);
    if (to < from) {
      throw new BadRequestException(
        'تاریخ پایان باید بعد یا برابر تاریخ شروع باشد',
      );
    }
    // «to» یعنی تا آخرِ همان روز، نه نیمه‌شبِ اولش — وگرنه تراکنش‌های همان روز جا می‌مانند.
    const toExclusive = new Date(to);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

    if (query.itemId) {
      const item = await this.findItemActiveOrThrow(query.itemId);
      this.ensureAccess(actor, item.marketId, 'دسترسی به این کالا مجاز نیست');
      return {
        from: query.from,
        to: query.to,
        item: await this.computeItemStatement(item, from, toExclusive),
      };
    }

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: query.warehouseId! },
    });
    if (!warehouse || warehouse.isDeleted)
      throw new NotFoundException('گدام یافت نشد');
    this.ensureAccess(
      actor,
      warehouse.marketId,
      'دسترسی به این گدام مجاز نیست',
    );

    const items = await this.prisma.inventoryItem.findMany({
      where: { warehouseId: warehouse.id, isDeleted: false },
      select: { id: true, name: true, unit: true, currencyId: true },
    });

    const statements = await Promise.all(
      items.map((item) => this.computeItemStatement(item, from, toExclusive)),
    );

    return {
      from: query.from,
      to: query.to,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      items: statements,
    };
  }

  // ==========================================================================
  // تراکنش‌های خرید/فروش/مصرف/اصلاح (InventoryTransaction)
  // خرید/فروش دقیقاً همان الگوی atomic و ledger-محورِ ShareholdersService.createTransaction:
  // موجودی کالا (و برای خرید/فروش، موجودی حساب) داخل یک تراکنش اتمیک تغییر می‌کند و یک
  // LedgerEntry متناظر ساخته می‌شود.
  // ==========================================================================

  async createTransaction(
    currentUser: { id: string },
    dto: CreateInventoryTransactionDto,
  ) {
    const actor = await this.getActor(currentUser);

    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: dto.itemId },
    });
    if (!item || item.isDeleted) throw new NotFoundException('کالا یافت نشد');
    this.ensureAccess(actor, item.marketId, 'دسترسی به این کالا مجاز نیست');
    if (!item.isActive) {
      throw new ConflictException('کالای غیرفعال قابل تراکنش نیست');
    }

    const quantity = new Prisma.Decimal(dto.quantity);
    if (quantity.isZero()) {
      throw new BadRequestException('مقدار نمی‌تواند صفر باشد');
    }
    if (
      dto.type !== InventoryTransactionType.ADJUSTMENT &&
      quantity.isNegative()
    ) {
      throw new BadRequestException('مقدار باید مثبت باشد');
    }

    const transactionDate = dto.transactionDate
      ? new Date(dto.transactionDate)
      : new Date();
    const isMoneyType = MONEY_TYPES.includes(dto.type);

    let account: Account | null = null;
    if (isMoneyType) {
      account = await this.prisma.account.findUnique({
        where: { id: dto.accountId! },
      });
      if (!account) throw new NotFoundException('حساب یافت نشد');
      if (account.marketId !== item.marketId) {
        throw new BadRequestException(
          'حساب باید متعلق به همان بازارِ کالا باشد',
        );
      }
      if (account.currencyId !== item.currencyId) {
        throw new BadRequestException(
          'ارز حساب باید با ارز کالا یکی باشد (این تراکنش نرخ تبدیل ارز را حساب نمی‌کند)',
        );
      }
      if (!account.isActive) {
        throw new ConflictException('حساب غیرفعال است');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      let totalAmount: Prisma.Decimal;
      let costOfGoodsSold: Prisma.Decimal | null = null;
      let updatedAccount = account;

      if (dto.type === InventoryTransactionType.PURCHASE) {
        const unitPrice = new Prisma.Decimal(dto.unitPrice!);
        const newQuantity = item.quantity.add(quantity);
        const newAverageCost = item.quantity
          .mul(item.averageCost)
          .add(quantity.mul(unitPrice))
          .div(newQuantity);

        // averageCost عددی محاسبه‌شده است (نه یک دلتای خالص)، پس به‌جای increment ساده
        // از یک قفل خوش‌بینانه (CAS) روی کل ردیف استفاده می‌شود.
        const applied = await tx.inventoryItem.updateMany({
          where: {
            id: item.id,
            quantity: item.quantity,
            averageCost: item.averageCost,
          },
          data: { quantity: newQuantity, averageCost: newAverageCost },
        });
        if (applied.count === 0) {
          throw new ConflictException(
            'موجودی کالا هم‌زمان توسط عملیات دیگری تغییر کرد؛ دوباره تلاش کنید',
          );
        }

        totalAmount = quantity.mul(unitPrice);

        const debited = await tx.account.updateMany({
          where: { id: account!.id, balance: { gte: totalAmount } },
          data: { balance: { decrement: totalAmount } },
        });
        if (debited.count === 0) {
          throw new ConflictException(
            `موجودی حساب «${account!.name}» برای این خرید کافی نیست`,
          );
        }
        updatedAccount = await tx.account.findUniqueOrThrow({
          where: { id: account!.id },
        });
      } else if (dto.type === InventoryTransactionType.SALE) {
        const unitPrice = new Prisma.Decimal(dto.unitPrice!);
        costOfGoodsSold = item.averageCost.mul(quantity);
        totalAmount = quantity.mul(unitPrice);

        const applied = await tx.inventoryItem.updateMany({
          where: { id: item.id, quantity: { gte: quantity } },
          data: { quantity: { decrement: quantity } },
        });
        if (applied.count === 0) {
          throw new ConflictException('موجودی کالا برای این فروش کافی نیست');
        }

        updatedAccount = await tx.account.update({
          where: { id: account!.id },
          data: { balance: { increment: totalAmount } },
        });
      } else if (dto.type === InventoryTransactionType.CONSUMPTION) {
        totalAmount = item.averageCost.mul(quantity);

        const applied = await tx.inventoryItem.updateMany({
          where: { id: item.id, quantity: { gte: quantity } },
          data: { quantity: { decrement: quantity } },
        });
        if (applied.count === 0) {
          throw new ConflictException('موجودی کالا برای این مصرف کافی نیست');
        }
      } else {
        // ADJUSTMENT: مثبت = افزایش موجودی (بدون تأثیر روی averageCost)، منفی = کاهش با
        // همان قفلِ موجودی‌کافی که فروش/مصرف استفاده می‌کنند.
        totalAmount = item.averageCost.mul(quantity.abs());

        if (quantity.isNegative()) {
          const absQty = quantity.abs();
          const applied = await tx.inventoryItem.updateMany({
            where: { id: item.id, quantity: { gte: absQty } },
            data: { quantity: { decrement: absQty } },
          });
          if (applied.count === 0) {
            throw new ConflictException('موجودی کالا برای این اصلاح کافی نیست');
          }
        } else {
          await tx.inventoryItem.update({
            where: { id: item.id },
            data: { quantity: { increment: quantity } },
          });
        }
      }

      const transaction = await tx.inventoryTransaction.create({
        data: {
          marketId: item.marketId,
          warehouseId: item.warehouseId,
          itemId: item.id,
          type: dto.type,
          quantity,
          unitPrice:
            dto.unitPrice !== undefined
              ? new Prisma.Decimal(dto.unitPrice)
              : null,
          totalAmount,
          costOfGoodsSold,
          accountId: account?.id ?? null,
          currencyId: item.currencyId,
          transactionDate,
          notes: dto.notes?.trim() || null,
          createdById: actor.id,
        },
      });

      if (account && updatedAccount) {
        await tx.ledgerEntry.create({
          data: {
            marketId: item.marketId,
            accountId: account.id,
            currencyId: account.currencyId,
            direction:
              dto.type === InventoryTransactionType.PURCHASE ? 'OUT' : 'IN',
            amount: totalAmount,
            balanceAfter: updatedAccount.balance,
            entryDate: transactionDate,
            description:
              dto.type === InventoryTransactionType.PURCHASE
                ? `خرید کالا «${item.name}»`
                : `فروش کالا «${item.name}»`,
            inventoryTransactionId: transaction.id,
            createdById: actor.id,
          },
        });
      }

      const updatedItem = await tx.inventoryItem.findUniqueOrThrow({
        where: { id: item.id },
      });
      return { transaction, item: updatedItem, account: updatedAccount };
    });
  }

  async findAllTransactions(
    currentUser: { id: string },
    query: InventoryTransactionQueryDto,
  ) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }
    const where: any = {
      ...(actor.role === 'SUPER_ADMIN' ? {} : { marketId: actor.marketId! }),
    };

    if (query.itemId !== undefined) where.itemId = query.itemId;
    if (query.warehouseId !== undefined) where.warehouseId = query.warehouseId;
    if (query.accountId !== undefined) where.accountId = query.accountId;
    if (query.type !== undefined) where.type = query.type;
    if (
      query.transactionDateFrom !== undefined ||
      query.transactionDateTo !== undefined
    ) {
      where.transactionDate = {
        ...(query.transactionDateFrom !== undefined
          ? { gte: new Date(query.transactionDateFrom) }
          : {}),
        ...(query.transactionDateTo !== undefined
          ? { lte: new Date(query.transactionDateTo) }
          : {}),
      };
    }

    const orderBy = resolveSort(
      query.sortBy,
      query.sortOrder,
      InventoryService.TRANSACTION_SORT_FIELDS,
      { transactionDate: 'desc' },
    );

    return paginate(this.prisma.inventoryTransaction, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      include: {
        item: { select: { id: true, name: true, unit: true } },
        warehouse: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
      },
    });
  }

  async findOneTransaction(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const transaction = await this.prisma.inventoryTransaction.findUnique({
      where: { id },
      include: {
        item: { select: { id: true, name: true, unit: true } },
        warehouse: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
      },
    });
    if (!transaction) throw new NotFoundException('تراکنش یافت نشد');
    this.ensureAccess(
      actor,
      transaction.marketId,
      'دسترسی به این تراکنش مجاز نیست',
    );
    return transaction;
  }
}
