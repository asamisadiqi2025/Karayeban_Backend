import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as currencyCodes from 'currency-codes';
import getCurrencySymbol from 'currency-symbol-map';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CurrencyCatalogItemDto } from './dto/currency-catalog-item.dto';

@Injectable()
export class CurrenciesService {
  constructor(private readonly prisma: PrismaService) {}

//  Get All World Currencies
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

    return all.filter((c) => c.code.toLowerCase().includes(term) || c.name.toLowerCase().includes(term));
  }

// Get currencies add to my System
  async getAddedCurrencies() {
    const currencies = await this.prisma.currency.findMany({ orderBy: { code: 'asc' } });
    return currencies.map((c) => ({ ...c, symbol: getCurrencySymbol(c.code) ?? null }));
  }

  // Add Curreny to System
   async addCurrency(code: string) {
    const normalizedCode = code.toUpperCase();
    const catalogEntry = currencyCodes.code(normalizedCode);
    if (!catalogEntry) {
      throw new BadRequestException(`"${normalizedCode}" یک کد ارز معتبر ISO 4217 نیست`);
    }

    const existing = await this.prisma.currency.findUnique({ where: { code: normalizedCode } });
    if (existing) {
      throw new ConflictException(`ارز "${normalizedCode}" قبلاً به سیستم اضافه شده است`);
    }

    const currency = await this.prisma.currency.create({
      data: { code: normalizedCode, name: catalogEntry.currency },
    });

    return { ...currency, symbol: getCurrencySymbol(normalizedCode) ?? null };
  }

  // Delete Currency when not operation or transaction added before
  async deleteCurrency(id: string) {
    const currency = await this.prisma.currency.findUnique({ where: { id } });
    if (!currency) {
      throw new NotFoundException('ارز مورد نظر یافت نشد');
    }

    const [
      accountsCount,
      openingBalancesCount,
      marketsCount,
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
      this.prisma.exchangeRate.count({ where: { currencyId: id } }),
      this.prisma.expense.count({ where: { currencyId: id } }),
      this.prisma.rentPayment.count({ where: { currencyId: id } }),
      this.prisma.rentCharges.count({ where: { currencyId: id } }),
      this.prisma.asset.count({ where: { currencyId: id } }),
      this.prisma.miscellaneousIncome.count({ where: { currencyId: id } }),
    ]);

    const usage: string[] = [];
    if (accountsCount) usage.push(`${accountsCount} حساب`);
    if (openingBalancesCount) usage.push(`${openingBalancesCount} موجودی افتتاحیه`);
    if (marketsCount) usage.push(`${marketsCount} بازار (به‌عنوان ارز پایه)`);
    if (exchangeRatesCount) usage.push(`${exchangeRatesCount} نرخ ارز ثبت‌شده`);
    if (expensesCount) usage.push(`${expensesCount} هزینه`);
    if (rentPaymentsCount) usage.push(`${rentPaymentsCount} پرداخت کرایه`);
    if (rentChargesCount) usage.push(`${rentChargesCount} صورت‌حساب کرایه`);
    if (assetsCount) usage.push(`${assetsCount} دارایی`);
    if (miscellaneousIncomeCount) usage.push(`${miscellaneousIncomeCount} درآمد متفرقه`);

    if (usage.length > 0) {
      throw new ConflictException(`ارز "${currency.code}" قابل حذف نیست چون در حال استفاده است: ${usage.join('، ')}`);
    }

    await this.prisma.currency.delete({ where: { id } });
    return { message: `ارز "${currency.code}" حذف شد` };
  }
}
