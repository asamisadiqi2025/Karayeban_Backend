import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ensureMarketSetupComplete } from '../../common/utils/ensure-market-setup-complete';
import { paginate, resolveSort, buildSearchWhere } from '../../common/utils/pagination';
import { CreateMeterDto } from './dto/create-meter.dto';
import { UpdateMeterDto } from './dto/update-meter.dto';
import { MeterQueryDto } from './dto/meter-query.dto';

type Actor = { id: string; role: string; marketId: string | null };

const SHOP_SELECT = { id: true, shopNumber: true, type: true, status: true } as const;

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

  async update(currentUser: { id: string }, id: string, dto: UpdateMeterDto) {
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

    try {
      return await this.prisma.electricityMeter.update({
        where: { id },
        data,
        include: { shop: { select: SHOP_SELECT } },
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        this.handleUniqueConflict(e, dto.shopNumber, dto.serialNumber);
      }
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
