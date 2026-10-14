import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as currencyCodes from 'currency-codes';
import getCurrencySymbol from 'currency-symbol-map';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CurrencyCatalogItemDto } from './dto/currency-catalog-item.dto';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginate, resolveSort, buildSearchWhere } from '../../common/utils/pagination';

type Actor = { id: string; role: string; marketId: string | null };

@Injectable()
export class CurrenciesService {
  private static readonly SORT_FIELDS = ['code', 'name'] as const;
  private static readonly SEARCH_FIELDS = ['code', 'name'] as const;

  constructor(private readonly prisma: PrismaService) {}

  private async getActor(currentUser: { id: string }): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, role: true, marketId: true },
    });
    if (!user) throw new ForbiddenException('کاربر معتبر نیست');
    return user;
  }

  // Get All World Currencies (برای جست‌وجو موقع افزودن — مستقل از هر مارکت)
  getCatalog(search?: string): CurrencyCatalogItemDto[] {
    const all = currencyCodes.data
      .map((c) => ({
        code: c.code,
        name: c.currency,
        symbol: getCurrencySymbol(c.code) ?? null,
        decimalDigits: c.digits,
      }))
      .sort((a, b) => a.code.localeCompare(b.code));

    const term = search?.trim().toLowerCase();
    if (!term) return all;

    return all.filter(
      (c) =>
        c.code.toLowerCase().includes(term) ||
        c.name.toLowerCase().includes(term),
    );
  }

  // ارزهایی که همین مارکت برای خودش فعال کرده — نه فهرست کل سیستم.
  // سوپرادمین (که به هیچ مارکتی وصل نیست) کل کاتالوگ سراسری را می‌بیند.
  async getAddedCurrencies(currentUser: { id: string }, query: PaginationQueryDto) {
    const actor = await this.getActor(currentUser);

    const orderBy = resolveSort(query.sortBy, query.sortOrder, CurrenciesService.SORT_FIELDS, {
      code: 'asc',
    });
    const searchWhere = buildSearchWhere(CurrenciesService.SEARCH_FIELDS, query.search);

    if (actor.role === 'SUPER_ADMIN') {
      const result = await paginate(this.prisma.currency, {
        where: searchWhere,
        orderBy,
        page: query.page,
        limit: query.limit,
      });
      return {
        ...result,
        data: result.data.map((c) => ({ ...c, symbol: getCurrencySymbol(c.code) ?? null })),
      };
    }

    if (!actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ مارکتی متصل نیست');
    }

    const result = await paginate(this.prisma.marketCurrency, {
      where: { marketId: actor.marketId, ...(searchWhere ? { currency: searchWhere } : {}) },
      orderBy: { currency: orderBy },
      include: { currency: true },
      page: query.page,
      limit: query.limit,
    });
    return {
      ...result,
      data: result.data.map((l: any) => ({
        ...l.currency,
        symbol: getCurrencySymbol(l.currency.code) ?? null,
      })),
    };
  }

  // فعال‌کردن یک ارز برای یک مارکت مشخص. اگر آن ارز اصلاً در کاتالوگ جهانی نبود،
  // همان یک‌بار (مشترک بین همه) ساخته می‌شود؛ ولی «فعال‌بودنش» همیشه مخصوص همان مارکت است.
  async addCurrency(currentUser: { id: string }, dto: CreateCurrencyDto) {
    const actor = await this.getActor(currentUser);

    let marketId: string;
    if (actor.role === 'SUPER_ADMIN') {
      if (!dto.marketId) {
        throw new BadRequestException('برای سوپر ادمین، marketId الزامی است');
      }
      marketId = dto.marketId;
    } else {
      if (!actor.marketId) {
        throw new ForbiddenException('کاربر جاری به هیچ مارکتی متصل نیست');
      }
      marketId = actor.marketId;
    }

    const normalizedCode = dto.code.toUpperCase();
    const catalogEntry = currencyCodes.code(normalizedCode);
    if (!catalogEntry) {
      throw new BadRequestException(
        `"${normalizedCode}" یک کد ارز معتبر ISO 4217 نیست`,
      );
    }

    let currency = await this.prisma.currency.findUnique({
      where: { code: normalizedCode },
    });
    if (!currency) {
      currency = await this.prisma.currency.create({
        data: { code: normalizedCode, name: catalogEntry.currency },
      });
    }

    await this.prisma.marketCurrency.upsert({
      where: { marketId_currencyId: { marketId, currencyId: currency.id } },
      create: { marketId, currencyId: currency.id },
      update: {},
    });

    return { ...currency, symbol: getCurrencySymbol(normalizedCode) ?? null };
  }

  // غیرفعال‌کردن یک ارز فقط برای مارکت خودِ کاربر (نه حذف سراسری). فقط با استفادهٔ
  // همان مارکت از همان ارز چک می‌شود، نه استفادهٔ کل سیستم — بر خلاف deleteCurrency
  // که سراسری است و اگر هر مارکتِ دیگری هم آن ارز را استفاده کند رد می‌شود.
  async removeCurrencyFromMarket(
    currentUser: { id: string },
    currencyId: string,
    explicitMarketId?: string,
  ) {
    const actor = await this.getActor(currentUser);

    let marketId: string;
    if (actor.role === 'SUPER_ADMIN') {
      if (!explicitMarketId) {
        throw new BadRequestException(
          'برای سوپر ادمین، پارامتر marketId الزامی است',
        );
      }
      marketId = explicitMarketId;
    } else {
      if (!actor.marketId) {
        throw new ForbiddenException('کاربر جاری به هیچ مارکتی متصل نیست');
      }
      marketId = actor.marketId;
    }

    const link = await this.prisma.marketCurrency.findUnique({
      where: { marketId_currencyId: { marketId, currencyId } },
      include: { currency: true },
    });
    if (!link) throw new NotFoundException('این ارز برای مارکت شما فعال نیست');

    const market = await this.prisma.market.findUnique({
      where: { id: marketId },
      select: { baseCurrencyId: true },
    });
    if (market?.baseCurrencyId === currencyId) {
      throw new ConflictException(
        'این ارز، ارز پایهٔ مارکت شماست و قابل غیرفعال‌کردن نیست',
      );
    }

    const [accountsCount, exchangeRatesCount] = await Promise.all([
      this.prisma.account.count({ where: { currencyId, marketId } }),
      this.prisma.exchangeRate.count({ where: { currencyId, marketId } }),
    ]);
    const usage: string[] = [];
    if (accountsCount) usage.push(`${accountsCount} حساب`);
    if (exchangeRatesCount) usage.push(`${exchangeRatesCount} نرخ ارز ثبت‌شده`);
    if (usage.length > 0) {
      throw new ConflictException(
        `این ارز در مارکت شما در حال استفاده است: ${usage.join('، ')} — نمی‌توانید غیرفعالش کنید`,
      );
    }

    await this.prisma.marketCurrency.delete({
      where: { marketId_currencyId: { marketId, currencyId } },
    });
    return { message: `ارز "${link.currency.code}" از فهرست مارکت شما حذف شد` };
  }

  // Delete Currency when not operation or transaction added before (سراسری — فقط سوپرادمین)
  async deleteCurrency(id: string) {
    const currency = await this.prisma.currency.findUnique({ where: { id } });
    if (!currency) {
      throw new NotFoundException('ارز مورد نظر یافت نشد');
    }

    const [
      accountsCount,
      openingBalancesCount,
      marketsCount,
      marketCurrenciesCount,
      exchangeRatesCount,
      expensesCount,
      rentPaymentsCount,
      rentChargesCount,
      assetsCount,
      miscellaneousIncomeCount,
    ] = await Promise.all([
      this.prisma.account.count({ where: { currencyId: id } }),
      this.prisma.openingBalance.count({ where: { currencyId: id } }),
      this.prisma.market.count({ where: { baseCurrencyId: id } }),
      this.prisma.marketCurrency.count({ where: { currencyId: id } }),
      this.prisma.exchangeRate.count({ where: { currencyId: id } }),
      this.prisma.expense.count({ where: { currencyId: id } }),
      this.prisma.rentPayment.count({ where: { currencyId: id } }),
      this.prisma.rentCharges.count({ where: { currencyId: id } }),
      this.prisma.asset.count({ where: { currencyId: id } }),
      this.prisma.miscellaneousIncome.count({ where: { currencyId: id } }),
    ]);

    const usage: string[] = [];
    if (accountsCount) usage.push(`${accountsCount} حساب`);
    if (openingBalancesCount)
      usage.push(`${openingBalancesCount} موجودی افتتاحیه`);
    if (marketsCount) usage.push(`${marketsCount}مارکت (به‌عنوان ارز پایه)`);
    if (marketCurrenciesCount)
      usage.push(`${marketCurrenciesCount} مارکت (فعال‌کرده)`);
    if (exchangeRatesCount) usage.push(`${exchangeRatesCount} نرخ ارز ثبت‌شده`);
    if (expensesCount) usage.push(`${expensesCount} هزینه`);
    if (rentPaymentsCount) usage.push(`${rentPaymentsCount} پرداخت کرایه`);
    if (rentChargesCount) usage.push(`${rentChargesCount} صورت‌حساب کرایه`);
    if (assetsCount) usage.push(`${assetsCount} دارایی`);
    if (miscellaneousIncomeCount)
      usage.push(`${miscellaneousIncomeCount} درآمد متفرقه`);

    if (usage.length > 0) {
      throw new ConflictException(
        `ارز "${currency.code}" قابل حذف نیست چون در حال استفاده است: ${usage.join('، ')}`,
      );
    }

    await this.prisma.currency.delete({ where: { id } });
    return { message: `ارز "${currency.code}" حذف شد` };
  }
}
