import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MeterStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../common/audit-log/audit-log.service';
import { RequestMeta } from '../../common/audit-log/request-meta.util';
import { kabulDate } from '../../common/utils/kabul-date';
import { ensureMarketSetupComplete } from '../../common/utils/ensure-market-setup-complete';
import { paginate, resolveSort, buildSearchWhere } from '../../common/utils/pagination';
import { CreateMeterDto } from './dto/create-meter.dto';
import { UpdateMeterDto } from './dto/update-meter.dto';
import { MeterQueryDto } from './dto/meter-query.dto';
import { ReplaceMeterDto } from './dto/replace-meter.dto';

type Actor = { id: string; role: string; marketId: string | null };

const NO_REQUEST_META: RequestMeta = { ip: null, userAgent: null };

// فیلدهایی که «مبنای محاسبهٔ بل» را می‌سازند: عوض‌شدنشان مبلغ بل‌های بعدی را عوض می‌کند، پس هر تغییرِ
// آن‌ها در audit log ثبت می‌شود (قبلاً PATCH بی‌ردپا می‌توانست قرائتِ مبنا را عوض کند).
const BILLING_BASELINE_FIELDS = ['shopId', 'serialNumber', 'status', 'lastReading', 'lastReadingDate'] as const;

// currentTenant/currentContractId اضافه شدند تا لیست کنتورها مستقیماً برای برگهٔ
// میترخوانی (نام مستأجر) و برای ساختن payload بل (contractId) کافی باشد — بدون رفت‌وبرگشتِ
// اضافه به /tenants یا /contracts.
const SHOP_SELECT = {
  id: true,
  shopNumber: true,
  type: true,
  status: true,
  currentContractId: true,
  currentTenant: { select: { id: true, fullName: true } },
} as const;

@Injectable()
export class MetersService {
  private static readonly SORT_FIELDS = [
    'meterNumber',
    'serialNumber',
    'lastReadingDate',
    'createdAt',
  ] as const;
  private static readonly SEARCH_FIELDS = [
    'serialNumber',
    'meterNumber',
    'location',
    'shop.shopNumber',
  ] as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // JWT در حال حاضر marketId را حمل نمی‌کند، پس همیشه از دیتابیس تازه خوانده می‌شود.
  private async getActor(currentUser: { id: string }): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, role: true, marketId: true },
    });
    if (!user) throw new ForbiddenException('کاربر معتبر نیست');
    return user;
  }

  private ensureAccess(actor: Actor, meterMarketId: string) {
    if (actor.role === 'SUPER_ADMIN') return;
    if (actor.marketId !== meterMarketId) {
      throw new ForbiddenException('دسترسی به این کنتور مجاز نیست');
    }
  }

  // شمارهٔ دوکان (نه UUID) را به دوکان واقعی همان بازار تبدیل می‌کند —
  // هم برای shopId و هم برای هم‌سان‌سازی خودکار meterNumber با شمارهٔ دوکان استفاده می‌شود.
  private async resolveShopByNumber(shopNumber: string, marketId: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { marketId_shopNumber: { marketId, shopNumber: shopNumber.trim() } },
      select: SHOP_SELECT,
    });
    if (!shop) {
      throw new NotFoundException(`دوکان شمارهٔ «${shopNumber}» در این بازار یافت نشد`);
    }
    return shop;
  }

  // یک ایجاد/آپدیت کنتور ممکن است هم‌زمان سه قید یکتایی متفاوت را نقض کند
  // (shop_id، market_id+meter_number که چون meterNumber همیشه از شمارهٔ دوکان می‌آید
  // عملاً هم‌معنی با shop_id است، یا market_id+serial_number) — باید هرکدام پیام خودش را بدهد.
  // با @prisma/adapter-pg، فیلدهای قید نقض‌شده زیر e.meta.driverAdapterError.cause.constraint.fields
  // می‌آیند، نه e.meta.target کلاسیک؛ هر دو شکل را چک می‌کنیم تا با تغییر نسخهٔ Prisma هم نشکند.
  private handleUniqueConflict(e: any, shopNumber?: string, serialNumber?: string): never {
    const adapterFields: string[] = e.meta?.driverAdapterError?.cause?.constraint?.fields ?? [];
    const classicTarget = e.meta?.target;
    const classicFields: string[] = Array.isArray(classicTarget)
      ? classicTarget
      : typeof classicTarget === 'string'
        ? [classicTarget]
        : [];
    const fields = [...adapterFields, ...classicFields];

    if (fields.includes('shop_id') || fields.includes('meter_number')) {
      throw new ConflictException(`دوکان شمارهٔ «${shopNumber}» از قبل یک کنتور دارد`);
    }
    if (fields.includes('serial_number')) {
      throw new ConflictException(
        `شمارهٔ سریال «${serialNumber}» در این بازار از قبل ثبت شده است`,
      );
    }
    throw new ConflictException('این مقدار در این بازار از قبل ثبت شده است');
  }

  async create(currentUser: { id: string }, dto: CreateMeterDto) {
    const actor = await this.getActor(currentUser);

    let marketId: string;
    if (actor.role === 'SUPER_ADMIN') {
      if (!dto.marketId) {
        throw new BadRequestException('برای سوپر ادمین، marketId الزامی است');
      }
      marketId = dto.marketId;
    } else {
      if (!actor.marketId) {
        throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
      }
      marketId = actor.marketId;
    }

    await ensureMarketSetupComplete(this.prisma, marketId);

    const shop = await this.resolveShopByNumber(dto.shopNumber, marketId);

    try {
      return await this.prisma.electricityMeter.create({
        data: {
          marketId,
          shopId: shop.id,
          meterNumber: shop.shopNumber,
          serialNumber: dto.serialNumber.trim(),
          status: dto.status,
          location: dto.location?.trim() || null,
          lastReading: dto.lastReading,
          lastReadingDate: dto.lastReadingDate ? new Date(dto.lastReadingDate) : null,
        },
        include: { shop: { select: SHOP_SELECT } },
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        this.handleUniqueConflict(e, dto.shopNumber, dto.serialNumber);
      }
      throw e;
    }
  }

  async findAll(currentUser: { id: string }, query: MeterQueryDto) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }
    const where: any =
      actor.role === 'SUPER_ADMIN' ? {} : { marketId: actor.marketId! };

    if (query.status !== undefined) where.status = query.status;
    if (query.shopId !== undefined) where.shopId = query.shopId;

    const searchWhere = buildSearchWhere(MetersService.SEARCH_FIELDS, query.search);
    if (searchWhere) where.AND = [searchWhere];

    const orderBy = resolveSort(query.sortBy, query.sortOrder, MetersService.SORT_FIELDS, {
      meterNumber: 'asc',
    });

    return paginate(this.prisma.electricityMeter, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      include: { shop: { select: SHOP_SELECT } },
    });
  }

  async findOne(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const meter = await this.prisma.electricityMeter.findUnique({
      where: { id },
      include: { shop: { select: SHOP_SELECT } },
    });
    if (!meter) throw new NotFoundException('کنتور یافت نشد');
    this.ensureAccess(actor, meter.marketId);
    return meter;
  }

  async update(
    currentUser: { id: string },
    id: string,
    dto: UpdateMeterDto,
    meta: RequestMeta = NO_REQUEST_META,
  ) {
    const actor = await this.getActor(currentUser);
    const meter = await this.prisma.electricityMeter.findUnique({ where: { id } });
    if (!meter) throw new NotFoundException('کنتور یافت نشد');
    this.ensureAccess(actor, meter.marketId);

    const data: Record<string, unknown> = {};

    if (dto.shopNumber !== undefined) {
      const shop = await this.resolveShopByNumber(dto.shopNumber, meter.marketId);
      data.shopId = shop.id;
      data.meterNumber = shop.shopNumber;
    }
    if (dto.serialNumber !== undefined) data.serialNumber = dto.serialNumber.trim();
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.location !== undefined) data.location = dto.location?.trim() || null;
    if (dto.lastReading !== undefined) data.lastReading = dto.lastReading;
    if (dto.lastReadingDate !== undefined) {
      data.lastReadingDate = dto.lastReadingDate ? new Date(dto.lastReadingDate) : null;
    }

    const changedBaseline = BILLING_BASELINE_FIELDS.filter((k) => k in data);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.electricityMeter.update({
          where: { id },
          data,
          include: { shop: { select: SHOP_SELECT } },
        });
        if (changedBaseline.length > 0) {
          const pick = (row: Record<string, unknown>) =>
            Object.fromEntries(changedBaseline.map((k) => [k, row[k] ?? null]));
          await this.auditLog.record({
            tx,
            action: 'UPDATE',
            entityType: 'ElectricityMeter',
            entityId: id,
            marketId: meter.marketId,
            userId: actor.id,
            oldData: pick(meter),
            newData: pick(updated),
            ip: meta.ip,
            userAgent: meta.userAgent,
          });
        }
        return updated;
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        this.handleUniqueConflict(e, dto.shopNumber ?? meter.meterNumber ?? undefined, dto.serialNumber);
      }
      throw e;
    }
  }

  // ==========================================================================
  // تعویضِ کنتورِ خراب: «کنتورِ قدیمی غیرفعال می‌شود (با سابقهٔ کاملش) و یک کنتورِ جدید برای همان دوکان
  // ساخته می‌شود» — همه در یک تراکنش. هر دستگاهِ فیزیکی رکوردِ خودش را دارد: بل‌های قدیمی با همان meterId
  // به کنتورِ قدیمی وصل می‌مانند و بل‌های بعدی روی کنتورِ جدید می‌نشینند. (همین کار را می‌توان دستی هم کرد:
  // PATCH status=inactive روی قدیمی + POST /meters برای جدید؛ این endpoint همان را «با محافظ» انجام می‌دهد.)
  //
  // دو عددِ کاملاً جدا: oldMeterFinalReading عددِ «کنتورِ خراب» است و فقط برای کنترل است؛
  // newMeterInitialReading عددِ «کنتورِ جدید» هنگامِ نصب است (۰ یا هر عددِ دیگر) و مبنای بل‌های بعدی می‌شود.
  //
  // محافظ (دلیلِ وجودِ این endpoint نسبت به روشِ دستی): «مصرفِ دستگاهِ قدیمی تا لحظهٔ تعویض باید کامل بل شده
  // باشد.» وگرنه با کنارگذاشتنِ کنتورِ قدیمی، مصرفِ بینِ آخرین قرائتِ بل‌شده و عددِ نهایی برای همیشه بل‌نشده
  // می‌ماند. پس oldMeterFinalReading باید دقیقاً برابرِ lastReading باشد؛ اگر بیشتر است، اول بلِ نهایی (با
  // readingDate) صادر می‌شود.
  // غیرفعال‌سازیِ قدیمی با یک updateMany شرطی (سریال و قرائتِ همان لحظه) انجام می‌شود تا اگر هم‌زمان بلی صادر شد و
  // قرائت جلو رفت، تعویض روی دادهٔ کهنه اعمال نشود (۴۰۹ و تلاش دوباره).
  // اگر کنتورِ قدیمی «کنتورِ اصلیِ یک گروهِ دوکان» بود، این نقش به کنتورِ جدید منتقل می‌شود.
  // دلیل اجباری است و برای هر دو کنتور در audit log ثبت می‌شود.
  // ==========================================================================
  async replace(
    currentUser: { id: string },
    id: string,
    dto: ReplaceMeterDto,
    meta: RequestMeta = NO_REQUEST_META,
  ) {
    const actor = await this.getActor(currentUser);
    const meter = await this.prisma.electricityMeter.findUnique({ where: { id } });
    if (!meter) throw new NotFoundException('کنتور یافت نشد');
    this.ensureAccess(actor, meter.marketId);

    if (meter.status !== MeterStatus.active) {
      throw new ConflictException('فقط کنتورِ فعال قابل تعویض است');
    }

    const newSerialNumber = dto.newSerialNumber.trim();
    const reason = dto.reason.trim();
    if (!newSerialNumber) throw new BadRequestException('سریالِ کنتورِ جدید نمی‌تواند خالی باشد');
    if (reason.length < 3) throw new BadRequestException('دلیلِ تعویض الزامی است');
    if (newSerialNumber.toLowerCase() === (meter.serialNumber ?? '').toLowerCase()) {
      throw new BadRequestException('سریالِ کنتورِ جدید باید با سریالِ فعلی فرق کند');
    }

    const finalReading = new Prisma.Decimal(dto.oldMeterFinalReading);
    if (meter.lastReading !== null) {
      if (finalReading.lessThan(meter.lastReading)) {
        throw new BadRequestException(
          `قرائتِ نهایی (${finalReading.toString()}) نمی‌تواند از آخرین قرائتِ ثبت‌شده (${meter.lastReading.toString()}) کمتر باشد`,
        );
      }
      if (finalReading.greaterThan(meter.lastReading)) {
        throw new ConflictException(
          `مصرفِ بینِ آخرین قرائتِ ثبت‌شده (${meter.lastReading.toString()}) و قرائتِ نهایی (${finalReading.toString()}) هنوز بل نشده؛ ` +
            `اول بلِ نهایی را با currentReading=${finalReading.toString()} و readingDate (تاریخِ تعویض) صادر کنید، بعد کنتور را تعویض کنید`,
        );
      }
    }

    const replacedAt = dto.replacedAt ? new Date(dto.replacedAt) : new Date();
    if (Number.isNaN(replacedAt.getTime())) throw new BadRequestException('تاریخ تعویض نامعتبر است');
    if (kabulDate(replacedAt).getTime() > kabulDate(new Date()).getTime()) {
      throw new BadRequestException('تاریخ تعویض نمی‌تواند در آینده باشد');
    }
    if (meter.lastReadingDate && kabulDate(replacedAt).getTime() < kabulDate(meter.lastReadingDate).getTime()) {
      throw new BadRequestException('تاریخ تعویض نمی‌تواند قبل از تاریخِ آخرین قرائتِ کنتور باشد');
    }
    const initialReading = new Prisma.Decimal(dto.newMeterInitialReading ?? 0);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // ۱) کنتورِ قدیمی را غیرفعال کن (اگر هم‌زمان تغییر کرده بود، رد شود). دوکان و شمارهٔ کنتورش روی خودش می‌ماند
        //    (سابقه)؛ ایندکس‌های یکتای «فقط بین فعال‌ها» دوکان را برای کنتورِ جدید آزاد می‌کنند.
        const deactivated = await tx.electricityMeter.updateMany({
          where: {
            id,
            status: MeterStatus.active,
            serialNumber: meter.serialNumber,
            lastReading: meter.lastReading,
          },
          data: { status: MeterStatus.inactive },
        });
        if (deactivated.count !== 1) {
          throw new ConflictException('کنتور هم‌زمان تغییر کرد؛ وضعیتِ فعلی را دوباره بخوانید و تلاش کنید');
        }

        // ۲) کنتورِ جدید برای همان دوکان، با قرائتِ شروعِ خودش.
        const created = await tx.electricityMeter.create({
          data: {
            marketId: meter.marketId,
            shopId: meter.shopId,
            meterNumber: meter.meterNumber,
            serialNumber: newSerialNumber,
            status: MeterStatus.active,
            location: meter.location,
            lastReading: initialReading,
            lastReadingDate: replacedAt,
          },
          include: { shop: { select: SHOP_SELECT } },
        });

        // ۳) نقشِ «کنتورِ اصلیِ گروهِ دوکان» (اگر داشت) به کنتورِ جدید می‌رود.
        const movedGroups = await tx.shopGroup.updateMany({
          where: { primaryMeterId: id },
          data: { primaryMeterId: created.id },
        });

        const oldMeter = await tx.electricityMeter.findUniqueOrThrow({
          where: { id },
          include: { shop: { select: SHOP_SELECT } },
        });

        // ۴) سابقهٔ تغییر (immutable): یک ردیف برای هر کنتور، هر دو با دلیل.
        await this.auditLog.record({
          tx,
          action: 'UPDATE',
          entityType: 'ElectricityMeter',
          entityId: id,
          marketId: meter.marketId,
          userId: actor.id,
          oldData: { status: meter.status, serialNumber: meter.serialNumber, lastReading: meter.lastReading, lastReadingDate: meter.lastReadingDate },
          newData: { status: MeterStatus.inactive, replacement: true, replacedByMeterId: created.id },
          reason,
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
        await this.auditLog.record({
          tx,
          action: 'CREATE',
          entityType: 'ElectricityMeter',
          entityId: created.id,
          marketId: meter.marketId,
          userId: actor.id,
          newData: {
            serialNumber: newSerialNumber,
            shopId: meter.shopId,
            meterNumber: meter.meterNumber,
            lastReading: initialReading,
            lastReadingDate: replacedAt,
            replacement: true,
            replacedMeterId: id,
          },
          reason,
          ip: meta.ip,
          userAgent: meta.userAgent,
        });

        return {
          // meter = کنتورِ «فعالِ» جدید؛ oldMeter = کنتورِ قدیمی (حالا غیرفعال).
          meter: created,
          oldMeter,
          replacement: {
            oldMeterId: id,
            newMeterId: created.id,
            oldSerialNumber: meter.serialNumber,
            newSerialNumber,
            oldMeterFinalReading: finalReading,
            newMeterInitialReading: initialReading,
            replacedAt,
            reason,
            shopGroupsMoved: movedGroups.count,
          },
        };
      });
    } catch (e: any) {
      if (e.code === 'P2002') this.handleUniqueConflict(e, undefined, newSerialNumber);
      throw e;
    }
  }

  async remove(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const meter = await this.prisma.electricityMeter.findUnique({ where: { id } });
    if (!meter) throw new NotFoundException('کنتور یافت نشد');
    this.ensureAccess(actor, meter.marketId);

    const [billsCount, primaryForShopGroupCount] = await Promise.all([
      this.prisma.electricityBill.count({ where: { meterId: id } }),
      this.prisma.shopGroup.count({ where: { primaryMeterId: id } }),
    ]);

    if (billsCount > 0 || primaryForShopGroupCount > 0) {
      throw new ConflictException(
        'این کنتور دارای سابقهٔ بل یا نقش کنتور اصلی در یک گروه ادغام است و قابل حذف نیست؛ در عوض می‌توانید آن را غیرفعال کنید',
      );
    }

    await this.prisma.electricityMeter.delete({ where: { id } });
    return { message: `کنتور شمارهٔ «${meter.meterNumber ?? meter.serialNumber}» حذف شد` };
  }
}
