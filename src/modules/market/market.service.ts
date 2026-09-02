import {
  BadRequestException,
  ConflictException,
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateMarketDto } from './dto/create-market.dto';
import { UpdateMarketProfileDto } from './dto/update-market-profile.dto';
import { UpdateExchangeRateDto } from './dto/update-exchange-rate.dto';
import { ConfigService } from '@nestjs/config';
import { ensureCurrencyEnabledForMarket } from '../../common/utils/ensure-currency-enabled-for-market';

type Actor = { id: string; role: string; marketId: string | null };

@Injectable()
export class MarketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // JWT در حال حاضر marketId را حمل نمی‌کند (ن.ک. jwt.strategy.ts)، پس همیشه از دیتابیس
  // تازه خوانده می‌شود تا نقش/مارکت واقعی کاربر معلوم باشد. قبلاً این متد اینجا نبود و
  // کد مستقیم currentUser.marketId (که همیشه undefined بود) را می‌خواند — یعنی هر ADMIN
  // همیشه با ۴۰۳ رد می‌شد، حتی برای مارکت خودش. همین باگ را الان درست می‌کنیم.
  private async getActor(currentUser: { id: string }): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, role: true, marketId: true },
    });
    if (!user) throw new ForbiddenException('کاربر معتبر نیست');
    return user;
  }

  private ensureAccess(actor: Actor, marketId: string) {
    if (actor.role === 'SUPER_ADMIN') return;
    if (actor.marketId !== marketId) {
      throw new ForbiddenException('دسترسی به این مارکت مجاز نیست');
    }
  }

  // هر مارکت یک مستأجر (tenant) مستقل در سیستم است — سوپرادمین برای هر مشتری جدید
  // یک مارکت می‌سازد. اگر baseCurrency همین‌جا داده نشود، مارکت به‌صورت «نیمه‌آماده»
  // ساخته می‌شود و ادمینِ همان مارکت با اولین ورودش، از PATCH /markets/:id/profile
  // ارز پایه را خودش (یک‌بار) تعیین می‌کند.
  async create(currentUser: { id: string }, dto: CreateMarketDto) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN')
      throw new ForbiddenException('Only super admin');

    let currencyId: string | undefined;
    if (dto.baseCurrency) {
      const currency = await this.prisma.currency.findUnique({
        where: { code: dto.baseCurrency },
      });
      if (!currency) {
        throw new NotFoundException(
          `ارز "${dto.baseCurrency}" در سیستم ثبت نشده؛ اول آن را از بخش ارزها اضافه کنید`,
        );
      }
      currencyId = currency.id;
    }

    try {
      const market = await this.prisma.market.create({
        data: {
          name: dto.name,
          subdomain: dto.subdomain,
          address: dto.address,
          logo: dto.logo || null,
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          baseCurrency: currencyId
            ? { connect: { id: currencyId } }
            : undefined,
          isSetupComplete: !!currencyId,
        },
      });
      // اولین ارز (ارز پایه) به‌محض ساخت مارکت، خودکار برای همان مارکت هم فعال می‌شود —
      // این تنها استثناست، چون قبل از وجود خودِ مارکت راهی برای «فعال‌کردن دستی» نبود.
      if (currencyId) {
        await this.prisma.marketCurrency.upsert({
          where: { marketId_currencyId: { marketId: market.id, currencyId } },
          create: { marketId: market.id, currencyId },
          update: {},
        });
      }
      return market;
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException(
          `ساب‌دومین "${dto.subdomain}" قبلاً برای مارکت دیگری استفاده شده است`,
        );
      }
      throw e;
    }
  }

  async findOne(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const market = await this.prisma.market.findUnique({ where: { id } });
    if (!market) throw new NotFoundException('Market not found');
    this.ensureAccess(actor, id);
    return market;
  }

  async updateProfile(
    currentUser: { id: string },
    id: string,
    dto: UpdateMarketProfileDto,
  ) {
    const actor = await this.getActor(currentUser);
    const market = await this.prisma.market.findUnique({ where: { id } });
    if (!market) throw new NotFoundException('Market not found');
    this.ensureAccess(actor, id);

    const { baseCurrency, ...rest } = dto as any;
    const updateData: any = { ...rest };
    if (baseCurrency) {
      if (market.baseCurrencyId) {
        throw new ConflictException(
          'ارز پایه بعد از تنظیم اولیه قابل تغییر نیست',
        );
      }
      const currency = await this.prisma.currency.findUnique({
        where: { code: baseCurrency },
      });
      if (!currency) {
        throw new NotFoundException(
          `ارز "${baseCurrency}" در سیستم ثبت نشده؛ اول آن را از بخش ارزها اضافه کنید`,
        );
      }
      // ارز پایه هم باید مثل هر ارز دیگر، اول برای همین مارکت فعال شده باشد
      // (از POST /currencies) — نه هر ارزی که در کاتالوگ جهانی وجود دارد.
      await ensureCurrencyEnabledForMarket(this.prisma, id, currency.id);
      updateData.baseCurrency = { connect: { id: currency.id } };
      // با تعیین ارز پایه (یک‌بار و برای همیشه)، راه‌اندازی مارکت کامل تلقی می‌شود —
      // از همین لحظه ساخت طبقه/بانک و بقیهٔ ماژول‌های وابسته به مارکت باز می‌شود.
      updateData.isSetupComplete = true;
    }

    const updated = await this.prisma.market.update({
      where: { id },
      data: updateData,
    });
    return updated;
  }

  async findAll(currentUser: { id: string }) {
    const actor = await this.getActor(currentUser);
    if (actor.role === 'SUPER_ADMIN') return this.prisma.market.findMany();
    if (!actor.marketId) throw new NotFoundException('User has no market');
    const market = await this.prisma.market.findUnique({
      where: { id: actor.marketId },
    });
    return [market];
  }

  // نرخ روزِ یک ارز نسبت به ارز پایهٔ مارکت را ثبت/به‌روزرسانی می‌کند. اگر همان روز قبلاً
  // نرخی برای همین ارز ثبت شده باشد جایگزین می‌شود (نه رکورد جدید)؛ روزهای قبلی در تاریخچه می‌مانند.
  // این مسیر توسط انتقال بین حساب‌ها (transfer) هرگز صدا زده نمی‌شود — نرخ دستیِ یک انتقال
  // فقط روی خودِ آن انتقال ثبت می‌شود و اینجا را تغییر نمی‌دهد.
  async setExchangeRate(
    currentUser: { id: string },
    marketId: string,
    dto: UpdateExchangeRateDto,
  ) {
    const actor = await this.getActor(currentUser);
    const market = await this.prisma.market.findUnique({
      where: { id: marketId },
    });
    if (!market) throw new NotFoundException('Market not found');
    this.ensureAccess(actor, marketId);

    if (!market.baseCurrencyId) {
      throw new BadRequestException(
        'ابتدا ارز پایهٔ مارکت را تنظیم کنید (پروفایل مارکت را تکمیل کنید)',
      );
    }
    if (dto.currencyId === market.baseCurrencyId) {
      throw new BadRequestException(
        'نرخ ارز پایه نسبت به خودش همیشه ۱ است و نیازی به ثبت ندارد',
      );
    }

    const currency = await this.prisma.currency.findUnique({
      where: { id: dto.currencyId },
    });
    if (!currency) throw new NotFoundException('ارز مورد نظر یافت نشد');
    await ensureCurrencyEnabledForMarket(this.prisma, marketId, dto.currencyId);

    const effectiveDate = dto.effectiveDate
      ? new Date(dto.effectiveDate)
      : new Date();
    effectiveDate.setUTCHours(0, 0, 0, 0);

    return this.prisma.exchangeRate.upsert({
      where: {
        marketId_currencyId_effectiveDate: {
          marketId,
          currencyId: dto.currencyId,
          effectiveDate,
        },
      },
      create: {
        marketId,
        currencyId: dto.currencyId,
        rateToBase: dto.rateToBase,
        effectiveDate,
        createdById: actor.id,
      },
      update: {
        rateToBase: dto.rateToBase,
        createdById: actor.id,
      },
      include: { currency: true },
    });
  }

  // آخرین نرخ ثبت‌شده برای هر ارز (به‌جز ارز پایه که نرخش همیشه ۱ است).
  async getExchangeRates(currentUser: { id: string }, marketId: string) {
    const actor = await this.getActor(currentUser);
    const market = await this.prisma.market.findUnique({
      where: { id: marketId },
    });
    if (!market) throw new NotFoundException('Market not found');
    this.ensureAccess(actor, marketId);

    return this.prisma.exchangeRate.findMany({
      where: { marketId },
      orderBy: [{ currencyId: 'asc' }, { effectiveDate: 'desc' }],
      distinct: ['currencyId'],
      include: { currency: true },
    });
  }
}
