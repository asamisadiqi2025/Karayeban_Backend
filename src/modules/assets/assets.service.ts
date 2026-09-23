import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ensureMarketSetupComplete } from '../../common/utils/ensure-market-setup-complete';
import { ensureCurrencyEnabledForMarket } from '../../common/utils/ensure-currency-enabled-for-market';
import { paginate, resolveSort, buildSearchWhere } from '../../common/utils/pagination';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { AssetQueryDto } from './dto/asset-query.dto';
import { AssetSummaryQueryDto } from './dto/asset-summary-query.dto';
import { AssetDepreciationSummaryQueryDto } from './dto/asset-depreciation-summary-query.dto';
import { AuditLogService } from '../../common/audit-log/audit-log.service';
import { RequestMeta } from '../../common/audit-log/request-meta.util';

const NO_REQUEST_META: RequestMeta = { ip: null, userAgent: null };

type Actor = { id: string; role: string; marketId: string | null };

@Injectable()
export class AssetsService {
  private static readonly SORT_FIELDS = [
    'name',
    'purchaseDate',
    'purchasePrice',
    'currentBookValue',
    'createdAt',
  ] as const;
  private static readonly SEARCH_FIELDS = ['name', 'category', 'details'] as const;
  private readonly logger = new Logger(AssetsService.name);

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

  private ensureAccess(actor: Actor, assetMarketId: string) {
    if (actor.role === 'SUPER_ADMIN') return;
    if (actor.marketId !== assetMarketId) {
      throw new ForbiddenException('دسترسی به این دارایی مجاز نیست');
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

    private calcAnnualDepreciation(
    purchasePrice: Prisma.Decimal | number,
    lifespanYears: number,
  ): Prisma.Decimal {
    return new Prisma.Decimal(purchasePrice).div(lifespanYears);
  }

  private async findActiveOrThrow(id: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset || asset.isDeleted) throw new NotFoundException('دارایی یافت نشد');
    return asset;
  }

  async create(currentUser: { id: string }, dto: CreateAssetDto, meta: RequestMeta) {
    const actor = await this.getActor(currentUser);
    const marketId = this.resolveMarketId(actor, dto.marketId);

    await ensureMarketSetupComplete(this.prisma, marketId);

    const currency = await this.prisma.currency.findUnique({
      where: { id: dto.currencyId },
    });
    if (!currency) throw new NotFoundException('ارز مورد نظر یافت نشد');
    await ensureCurrencyEnabledForMarket(this.prisma, marketId, dto.currencyId);

    const purchasePrice = new Prisma.Decimal(dto.purchasePrice);
    const annualDepreciation = this.calcAnnualDepreciation(purchasePrice, dto.lifespanYears);
    const purchaseDate = dto.purchaseDate ? new Date(dto.purchaseDate) : new Date();

    const asset = await this.prisma.asset.create({
      data: {
        marketId,
        name: dto.name.trim(),
        category: dto.category?.trim() || null,
        purchasePrice,
        currencyId: dto.currencyId,
        lifespanYears: dto.lifespanYears,
        annualDepreciation,
         currentBookValue: purchasePrice,
        purchaseDate,
        details: dto.details?.trim() || null,
      },
    });

    await this.auditLog.record({
      action: 'CREATE',
      entityType: 'Asset',
      entityId: asset.id,
      marketId,
      userId: actor.id,
      newData: asset,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return asset;
  }

  async findAll(currentUser: { id: string }, query: AssetQueryDto) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }
    const where: any = {
      isDeleted: false,
      ...(actor.role === 'SUPER_ADMIN' ? {} : { marketId: actor.marketId! }),
    };

    if (query.status !== undefined) where.status = query.status;
    if (query.category !== undefined) where.category = query.category;
    if (query.currencyId !== undefined) where.currencyId = query.currencyId;

    const searchWhere = buildSearchWhere(AssetsService.SEARCH_FIELDS, query.search);
    if (searchWhere) where.AND = [searchWhere];

    const orderBy = resolveSort(query.sortBy, query.sortOrder, AssetsService.SORT_FIELDS, {
      purchaseDate: 'desc',
    });

    return paginate(this.prisma.asset, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      include: { currency: { select: { id: true, code: true, name: true } } },
    });
  }

  async findOne(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const asset = await this.findActiveOrThrow(id);
    this.ensureAccess(actor, asset.marketId);

    return this.prisma.asset.findUnique({
      where: { id },
      include: {
        currency: { select: { id: true, code: true, name: true } },
        depreciationEvents: { orderBy: { year: 'desc' } },
      },
    });
  }

  async update(
    currentUser: { id: string },
    id: string,
    dto: UpdateAssetDto,
    meta: RequestMeta,
  ) {
    const actor = await this.getActor(currentUser);
    const asset = await this.findActiveOrThrow(id);
    this.ensureAccess(actor, asset.marketId);

    if (dto.currencyId !== undefined && dto.currencyId !== asset.currencyId) {
      const currency = await this.prisma.currency.findUnique({
        where: { id: dto.currencyId },
      });
      if (!currency) throw new NotFoundException('ارز مورد نظر یافت نشد');
      await ensureCurrencyEnabledForMarket(this.prisma, asset.marketId, dto.currencyId);
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.category !== undefined) data.category = dto.category?.trim() || null;
    if (dto.currencyId !== undefined) data.currencyId = dto.currencyId;
    if (dto.purchaseDate !== undefined) data.purchaseDate = new Date(dto.purchaseDate);
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.details !== undefined) data.details = dto.details?.trim() || null;
 
    if (dto.purchasePrice !== undefined || dto.lifespanYears !== undefined) {
      const purchasePrice = new Prisma.Decimal(dto.purchasePrice ?? asset.purchasePrice);
      const lifespanYears = dto.lifespanYears ?? asset.lifespanYears;

      data.purchasePrice = purchasePrice;
      data.lifespanYears = lifespanYears;
      data.annualDepreciation = this.calcAnnualDepreciation(purchasePrice, lifespanYears);

      const depreciationEventsCount = await this.prisma.depreciationEvent.count({
        where: { assetId: id },
      });
      if (depreciationEventsCount === 0) {
        data.currentBookValue = purchasePrice;
      }
    }

    const updated = await this.prisma.asset.update({ where: { id }, data });

    await this.auditLog.record({
      action: 'UPDATE',
      entityType: 'Asset',
      entityId: id,
      marketId: asset.marketId,
      userId: actor.id,
      oldData: asset,
      newData: updated,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return updated;
  }

   async remove(currentUser: { id: string }, id: string, meta: RequestMeta) {
    const actor = await this.getActor(currentUser);
    const asset = await this.findActiveOrThrow(id);
    this.ensureAccess(actor, asset.marketId);

    await this.prisma.asset.update({ where: { id }, data: { isDeleted: true } });

    await this.auditLog.record({
      action: 'DELETE',
      entityType: 'Asset',
      entityId: id,
      marketId: asset.marketId,
      userId: actor.id,
      oldData: asset,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return { message: `دارایی «${asset.name}» حذف شد` };
  }

    async getSummary(currentUser: { id: string }, query: AssetSummaryQueryDto) {
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

    const where: any = { isDeleted: false, ...(marketId ? { marketId } : {}) };

    const [totalAssets, statusGroups, currencyGroups] = await Promise.all([
      this.prisma.asset.count({ where }),
      this.prisma.asset.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.asset.groupBy({
        by: ['currencyId'],
        where,
        _sum: { purchasePrice: true, currentBookValue: true },
        _count: { _all: true },
      }),
    ]);

    const currencies = await this.prisma.currency.findMany({
      where: { id: { in: currencyGroups.map((g) => g.currencyId) } },
      select: { id: true, code: true, name: true },
    });
    const currencyById = new Map(currencies.map((c) => [c.id, c]));

    return {
      marketId: marketId ?? null,
      totalAssets,
      activeAssets: statusGroups.find((g) => g.status === 'active')?._count._all ?? 0,
      disposedAssets: statusGroups.find((g) => g.status === 'disposed')?._count._all ?? 0,
      byCurrency: currencyGroups.map((g) => ({
        currencyId: g.currencyId,
        currencyCode: currencyById.get(g.currencyId)?.code ?? null,
        currencyName: currencyById.get(g.currencyId)?.name ?? null,
        count: g._count._all,
        totalPurchasePrice: g._sum.purchasePrice ?? new Prisma.Decimal(0),
        totalCurrentBookValue: g._sum.currentBookValue ?? new Prisma.Decimal(0),
      })),
    };
  }

  // هزینهٔ استهلاکِ شناسایی‌شده در یک بازه — چیزی که در گزارشِ P&Lِ نقدی
  // (reports/financials/summary) اصلاً دیده نمی‌شود، چون استهلاک هیچ پولی جابه‌جا نمی‌کند
  // (فقط ارزشِ دفتری کم می‌شود) و LedgerEntry هم برایش ردیفی نمی‌سازد. برای تصویرِ واقعی‌ترِ
  // سود، این باید کنارِ نقد و COGS (ن.ک. InventoryService.getMovementSummary) دیده شود.
  //
  // چرا appliedAt، نه year: فیلدِ year روی DepreciationEvent شمارندهٔ «سالِ چندمِ عمرِ همین
  // دارایی» است (۱، ۲، ۳...)، نه سالِ تقویمی — پس برای فیلترِ «در بازهٔ تقویمیِ X» باید
  // appliedAt (لحظهٔ واقعی‌ای که cron آن را ثبت کرده) استفاده شود.
  //
  // چرا fetch+groupBy در حافظه، نه groupBy در دیتابیس: DepreciationEvent نه marketId دارد
  // نه currencyId — این‌ها فقط از طریقِ رابطهٔ Asset معلوم می‌شوند، و Prisma نمی‌تواند در
  // سطحِ groupBy روی فیلدِ یک رابطه گروه بزند. چون استهلاک حداکثر یک‌بار در سال به‌ازای هر
  // دارایی ثبت می‌شود (نه هر روز مثل کرایه)، تعدادِ رویدادها همیشه به‌شدت محدود و کوچک است.
  async getDepreciationSummary(
    currentUser: { id: string },
    query: AssetDepreciationSummaryQueryDto,
  ) {
    const actor = await this.getActor(currentUser);
    const marketId = this.resolveMarketId(actor, query.marketId);

    const from = new Date(query.from);
    const to = new Date(query.to);
    if (to < from) {
      throw new BadRequestException('تاریخ پایان باید بعد یا برابر تاریخ شروع باشد');
    }
    const toExclusive = new Date(to);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

    const events = await this.prisma.depreciationEvent.findMany({
      where: {
        appliedAt: { gte: from, lt: toExclusive },
        asset: { marketId, isDeleted: false },
      },
      select: {
        assetId: true,
        depreciationAmount: true,
        asset: { select: { currencyId: true } },
      },
    });

    const currencyIds = [...new Set(events.map((e) => e.asset.currencyId))];
    const currencies = currencyIds.length
      ? await this.prisma.currency.findMany({
          where: { id: { in: currencyIds } },
          select: { id: true, code: true },
        })
      : [];
    const currencyCodeById = new Map(currencies.map((c) => [c.id, c.code]));

    const zero = new Prisma.Decimal(0);
    const byCurrency = new Map<
      string,
      { currencyId: string; currencyCode: string | null; totalDepreciation: Prisma.Decimal; eventCount: number; assetIds: Set<string> }
    >();

    for (const e of events) {
      const currencyId = e.asset.currencyId;
      const bucket = byCurrency.get(currencyId) ?? {
        currencyId,
        currencyCode: currencyCodeById.get(currencyId) ?? null,
        totalDepreciation: zero,
        eventCount: 0,
        assetIds: new Set<string>(),
      };
      bucket.totalDepreciation = bucket.totalDepreciation.add(e.depreciationAmount);
      bucket.eventCount += 1;
      bucket.assetIds.add(e.assetId);
      byCurrency.set(currencyId, bucket);
    }

    return {
      marketId,
      from: query.from,
      to: query.to,
      byCurrency: [...byCurrency.values()].map((b) => ({
        currencyId: b.currencyId,
        currencyCode: b.currencyCode,
        totalDepreciation: b.totalDepreciation,
        eventCount: b.eventCount,
        assetCount: b.assetIds.size,
      })),
    };
  }

   private calcYearsElapsed(purchaseDate: Date, now: Date): number {
    let years = now.getFullYear() - purchaseDate.getFullYear();
    const anniversaryPassed =
      now.getMonth() > purchaseDate.getMonth() ||
      (now.getMonth() === purchaseDate.getMonth() && now.getDate() >= purchaseDate.getDate());
    if (!anniversaryPassed) years -= 1;
    return Math.max(years, 0);
  }

   private async applyOneDepreciationYear(assetId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { id: assetId } });
      if (!asset || asset.isDeleted || asset.status !== 'active') return false;
      if (asset.currentBookValue.lte(0)) return false;

      const appliedYears = await tx.depreciationEvent.count({ where: { assetId } });
      if (appliedYears >= asset.lifespanYears) return false;

      const bookValueBefore = asset.currentBookValue;
      const remainingYears = asset.lifespanYears - appliedYears;
       const depreciationAmount =
        remainingYears === 1
          ? bookValueBefore
          : Prisma.Decimal.min(asset.annualDepreciation, bookValueBefore);
      const bookValueAfter = bookValueBefore.sub(depreciationAmount);

      const event = await tx.depreciationEvent.create({
        data: {
          assetId,
          year: appliedYears + 1,
          depreciationAmount,
          bookValueBefore,
          bookValueAfter,
        },
      });

      await tx.asset.update({
        where: { id: assetId },
        data: { currentBookValue: bookValueAfter },
      });

      // این رویداد از کرون شبانه می‌آید، نه یک کاربر — userId/ip/UA عمداً خالی می‌مانند؛
      // خودِ اکشن (تغییرِ ارزشِ دفتری) هنوز باید در audit trail باشد چون روی صورت‌های
      // مالی اثر می‌گذارد.
      await this.auditLog.record({
        tx,
        action: 'UPDATE',
        entityType: 'Asset',
        entityId: assetId,
        marketId: asset.marketId,
        newData: { depreciationEvent: event, currentBookValue: bookValueAfter },
        ...NO_REQUEST_META,
      });

      return true;
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async applyScheduledDepreciation() {
    const now = new Date();
    const assets = await this.prisma.asset.findMany({
      where: { isDeleted: false, status: 'active' },
      select: { id: true, purchaseDate: true, lifespanYears: true },
    });

    let appliedCount = 0;
    for (const asset of assets) {
      const appliedYears = await this.prisma.depreciationEvent.count({
        where: { assetId: asset.id },
      });
      const yearsElapsed = this.calcYearsElapsed(asset.purchaseDate, now);
      const yearsDue = Math.min(yearsElapsed, asset.lifespanYears);
      // فقط تفاوتِ نرسیده‌ها اعمال شود؛ وگرنه هر بار اجرای کرون (بدون سررسید تازه) یک
      // سال اضافه استهلاک می‌زد چون yearsDue مطلق بود، نه نسبت به آنچه قبلاً ثبت شده.
      const yearsToApply = yearsDue - appliedYears;

      for (let i = 0; i < yearsToApply; i++) {
        const applied = await this.applyOneDepreciationYear(asset.id);
        if (!applied) break;
        appliedCount++;
      }
    }

    if (appliedCount > 0) {
      this.logger.log(`استهلاک سالانه برای ${appliedCount} رویداد اعمال شد`);
    }
  }
}
