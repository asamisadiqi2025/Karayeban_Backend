import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { TransferFundsDto } from './dto/transfer-funds.dto';
import { AccountQueryDto } from './dto/account-query.dto';
import { TransferQueryDto } from './dto/transfer-query.dto';
import { ensureMarketSetupComplete } from '../../common/utils/ensure-market-setup-complete';
import { ensureCurrencyEnabledForMarket } from '../../common/utils/ensure-currency-enabled-for-market';
import { paginate, resolveSort, buildSearchWhere } from '../../common/utils/pagination';

type Actor = { id: string; role: string; marketId: string | null };

@Injectable()
export class AccountsService {
  private static readonly SORT_FIELDS = ['name', 'balance', 'createdAt'] as const;
  private static readonly SEARCH_FIELDS = ['name', 'bankName', 'accountNumber'] as const;
  private static readonly TRANSFER_SORT_FIELDS = ['transferDate', 'amount', 'createdAt'] as const;
  private static readonly TRANSFER_SEARCH_FIELDS = [
    'notes',
    'fromAccount.name',
    'toAccount.name',
  ] as const;

  constructor(private readonly prisma: PrismaService) {}

  private async getActor(currentUser: { id: string }): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, role: true, marketId: true },
    });
    if (!user) throw new ForbiddenException('کاربر معتبر نیست');
    return user;
  }

  private ensureAccess(actor: Actor, accountMarketId: string) {
    if (actor.role === 'SUPER_ADMIN') return;
    if (actor.marketId !== accountMarketId) {
      throw new ForbiddenException('دسترسی به این حساب مجاز نیست');
    }
  }

  // نرخ «۱ واحد این ارز = X واحد ارز پایه» را برمی‌گرداند: ۱ برای خودِ ارز پایه،
  // وگرنه آخرین نرخ ثبت‌شده در ExchangeRate (تنظیمات مارکت). این متد فقط می‌خواند،
  // هرگز چیزی در جدول نرخ ارز نمی‌نویسد.
  private async getRateToBase(
    marketId: string,
    currencyId: string,
    baseCurrencyId: string,
  ): Promise<Prisma.Decimal | null> {
    if (currencyId === baseCurrencyId) return new Prisma.Decimal(1);
    const row = await this.prisma.exchangeRate.findFirst({
      where: { marketId, currencyId },
      orderBy: { effectiveDate: 'desc' },
    });
    return row ? row.rateToBase : null;
  }

  // وقتی کاربر نرخ تبدیل را دستی نمی‌فرستد، از روی آخرین نرخ‌های ثبت‌شدهٔ هر دو ارز
  // نسبت به ارز پایهٔ مارکت محاسبه می‌شود («نرخ خوانده می‌شود»، طبق چیزی که خواستی).
  private async resolveExchangeRate(
    marketId: string,
    fromCurrencyId: string,
    toCurrencyId: string,
  ): Promise<Prisma.Decimal> {
    const market = await this.prisma.market.findUnique({
      where: { id: marketId },
      select: { baseCurrencyId: true },
    });
    if (!market?.baseCurrencyId) {
      throw new BadRequestException(
        'نرخ تبدیل ارسال نشده و ارز پایهٔ مارکت هم تنظیم نیست؛ نرخ را دستی بفرستید',
      );
    }

    const [fromRate, toRate] = await Promise.all([
      this.getRateToBase(marketId, fromCurrencyId, market.baseCurrencyId),
      this.getRateToBase(marketId, toCurrencyId, market.baseCurrencyId),
    ]);
    if (!fromRate || !toRate) {
      throw new BadRequestException(
        'نرخ تبدیل ارسال نشده و برای این جفت ارز در تنظیمات مارکت هم نرخی ثبت نشده؛ نرخ را دستی بفرستید یا ابتدا نرخ روز را ثبت کنید',
      );
    }
    return fromRate.div(toRate);
  }

  async create(currentUser: { id: string }, dto: CreateAccountDto) {
    const actor = await this.getActor(currentUser);

    let marketId: string;
    if (actor.role === 'SUPER_ADMIN') {
      if (!dto.marketId) {
        throw new BadRequestException('برای سوپر ادمین، marketId الزامی است');
      }
      marketId = dto.marketId;
    } else {
      if (!actor.marketId) {
        throw new ForbiddenException('کاربر جاری به هیچ  مارکت ی متصل نیست');
      }
      marketId = actor.marketId;
    }

    await ensureMarketSetupComplete(this.prisma, marketId);

    const currency = await this.prisma.currency.findUnique({
      where: { id: dto.currencyId },
    });
    if (!currency) throw new NotFoundException('ارز مورد نظر یافت نشد');
    await ensureCurrencyEnabledForMarket(this.prisma, marketId, dto.currencyId);

    const openingAmount = dto.openingBalance?.amount ?? 0;
    const openingDate = dto.openingBalance?.openingDate
      ? new Date(dto.openingBalance.openingDate)
      : new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const account = await tx.account.create({
          data: {
            marketId,
            currencyId: dto.currencyId,
            name: dto.name.trim(),
            type: dto.type,
            accountNumber: dto.accountNumber?.trim() || null,
            bankName: dto.bankName?.trim() || null,
            balance: openingAmount,
          },
        });

        if (openingAmount !== 0) {
          const openingBalance = await tx.openingBalance.create({
            data: {
              marketId,
              accountId: account.id,
              currencyId: dto.currencyId,
              amount: openingAmount,
              exchangeRate: dto.openingBalance?.exchangeRate ?? null,
              baseCurrencyAmount:
                dto.openingBalance?.baseCurrencyAmount ?? null,
              openingDate,
              createdById: actor.id,
            },
          });

          await tx.ledgerEntry.create({
            data: {
              marketId,
              accountId: account.id,
              currencyId: dto.currencyId,
              direction: openingAmount > 0 ? 'IN' : 'OUT',
              amount: Math.abs(openingAmount),
              balanceAfter: openingAmount,
              entryDate: openingDate,
              description: 'موجودی افتتاحیهٔ حساب',
              openingBalanceId: openingBalance.id,
              createdById: actor.id,
            },
          });
        }

        return account;
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException(
          `حسابی با نام «${dto.name}» در این مارکت از قبل وجود دارد`,
        );
      }
      throw e;
    }
  }

  async findAll(currentUser: { id: string }, query: AccountQueryDto) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ مارکتی متصل نیست');
    }
    const where: any =
      actor.role === 'SUPER_ADMIN' ? {} : { marketId: actor.marketId! };
    if (query.type !== undefined) where.type = query.type;
    if (query.isActive !== undefined) where.isActive = query.isActive;

    const searchWhere = buildSearchWhere(AccountsService.SEARCH_FIELDS, query.search);
    if (searchWhere) Object.assign(where, searchWhere);

    const orderBy = resolveSort(query.sortBy, query.sortOrder, AccountsService.SORT_FIELDS, {
      createdAt: 'asc',
    });

    return paginate(this.prisma.account, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
    });
  }

  async findOne(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('حساب یافت نشد');
    this.ensureAccess(actor, account.marketId);
    return account;
  }

  async update(currentUser: { id: string }, id: string, dto: UpdateAccountDto) {
    const actor = await this.getActor(currentUser);
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('حساب یافت نشد');
    this.ensureAccess(actor, account.marketId);

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.bankName !== undefined)
      data.bankName = dto.bankName?.trim() || null;
    if (dto.accountNumber !== undefined)
      data.accountNumber = dto.accountNumber?.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      return await this.prisma.account.update({ where: { id }, data });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException(
          `حسابی با نام «${dto.name}» در این مارکت  از قبل وجود دارد`,
        );
      }
      throw e;
    }
  }

  async remove(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('حساب یافت نشد');
    this.ensureAccess(actor, account.marketId);

    if (account.isSystem) {
      throw new ConflictException('حساب‌های سیستمی قابل حذف نیستند');
    }

    const [
      ledgerEntriesCount,
      openingBalancesCount,
      expensesCount,
      rentPaymentsCount,
      rentChargesCount,
      miscellaneousIncomeCount,
      electricityPaymentsCount,
      shareholderTransactionsCount,
      collateralItemsCount,
      transfersOutCount,
      transfersInCount,
    ] = await Promise.all([
      this.prisma.ledgerEntry.count({ where: { accountId: id } }),
      this.prisma.openingBalance.count({ where: { accountId: id } }),
      this.prisma.expense.count({ where: { accountId: id } }),
      this.prisma.rentPayment.count({ where: { accountId: id } }),
      this.prisma.rentCharges.count({ where: { accountId: id } }),
      this.prisma.miscellaneousIncome.count({ where: { accountId: id } }),
      this.prisma.electricityPayment.count({ where: { accountId: id } }),
      this.prisma.shareholderTransaction.count({ where: { accountId: id } }),
      this.prisma.collateralItem.count({ where: { accountId: id } }),
      this.prisma.accountTransfer.count({ where: { fromAccountId: id } }),
      this.prisma.accountTransfer.count({ where: { toAccountId: id } }),
    ]);

    const hasTransactions =
      ledgerEntriesCount > 0 ||
      openingBalancesCount > 0 ||
      expensesCount > 0 ||
      rentPaymentsCount > 0 ||
      rentChargesCount > 0 ||
      miscellaneousIncomeCount > 0 ||
      electricityPaymentsCount > 0 ||
      shareholderTransactionsCount > 0 ||
      collateralItemsCount > 0 ||
      transfersOutCount > 0 ||
      transfersInCount > 0;

    if (hasTransactions) {
      throw new ConflictException(
        'این حساب دارای تراکنش (پرداخت، هزینه، انتقال یا موجودی افتتاحیه) است و قابل حذف نیست؛ در عوض می‌توانید آن را غیرفعال کنید',
      );
    }

    await this.prisma.account.delete({ where: { id } });
    return { message: `حساب «${account.name}» حذف شد` };
  }

  async transfer(currentUser: { id: string }, dto: TransferFundsDto) {
    const actor = await this.getActor(currentUser);

    if (dto.fromAccountId === dto.toAccountId) {
      throw new BadRequestException('حساب مبدا و مقصد نمی‌توانند یکی باشند');
    }

    const [fromAccount, toAccount] = await Promise.all([
      this.prisma.account.findUnique({ where: { id: dto.fromAccountId } }),
      this.prisma.account.findUnique({ where: { id: dto.toAccountId } }),
    ]);
    if (!fromAccount) throw new NotFoundException('حساب مبدا یافت نشد');
    if (!toAccount) throw new NotFoundException('حساب مقصد یافت نشد');

    if (fromAccount.marketId !== toAccount.marketId) {
      throw new BadRequestException(
        'انتقال فقط بین حساب‌های یک مارکت  مجاز است',
      );
    }
    this.ensureAccess(actor, fromAccount.marketId);

    if (!fromAccount.isActive)
      throw new ConflictException('حساب مبدا غیرفعال است');
    if (!toAccount.isActive)
      throw new ConflictException('حساب مقصد غیرفعال است');

    const amount = new Prisma.Decimal(dto.amount);
    const isCrossCurrency = fromAccount.currencyId !== toAccount.currencyId;

    let receivedAmount: Prisma.Decimal;
    let exchangeRate: Prisma.Decimal | null = null;

    if (isCrossCurrency) {
      if (dto.exchangeRate !== undefined && dto.exchangeRate !== null) {
        // نرخ دستی همین یک انتقال را می‌پوشاند؛ هیچ‌جا در ExchangeRate ذخیره نمی‌شود.
        exchangeRate = new Prisma.Decimal(dto.exchangeRate);
      } else {
        exchangeRate = await this.resolveExchangeRate(
          fromAccount.marketId,
          fromAccount.currencyId,
          toAccount.currencyId,
        );
      }
      receivedAmount = amount.mul(exchangeRate).toDecimalPlaces(4);
    } else {
      if (dto.exchangeRate !== undefined && dto.exchangeRate !== null) {
        throw new BadRequestException(
          'حساب مبدا و مقصد هم‌ارز هستند؛ نرخ تبدیل نباید ارسال شود',
        );
      }
      receivedAmount = amount;
    }

    return await this.prisma.$transaction(async (tx) => {
      // کاهش اتمیک موجودی مبدا؛ شرط balance >= amount مستقیم در WHERE چک می‌شود
      // تا زیر بار همزمان دو انتقال، موجودی هرگز منفی نشود.
      const debited = await tx.account.updateMany({
        where: { id: fromAccount.id, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });
      if (debited.count === 0) {
        throw new ConflictException(
          `موجودی حساب «${fromAccount.name}» برای این انتقال کافی نیست`,
        );
      }

      const updatedToAccount = await tx.account.update({
        where: { id: toAccount.id },
        data: { balance: { increment: receivedAmount } },
      });
      const updatedFromAccount = await tx.account.findUniqueOrThrow({
        where: { id: fromAccount.id },
      });

      const rateNote = exchangeRate
        ? ` (نرخ تبدیل: ${exchangeRate.toString()})`
        : '';

      const accountTransfer = await tx.accountTransfer.create({
        data: {
          marketId: fromAccount.marketId,
          fromAccountId: fromAccount.id,
          toAccountId: toAccount.id,
          amount,
          receivedAmount,
          exchangeRate,
          transferDate: dto.transferDate
            ? new Date(dto.transferDate)
            : new Date(),
          notes: dto.notes?.trim() || null,
          createdById: actor.id,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          marketId: fromAccount.marketId,
          accountId: fromAccount.id,
          currencyId: fromAccount.currencyId,
          direction: 'OUT',
          amount,
          balanceAfter: updatedFromAccount.balance,
          entryDate: accountTransfer.transferDate,
          description: `انتقال به حساب «${toAccount.name}»${rateNote}`,
          accountTransferId: accountTransfer.id,
          createdById: actor.id,
        },
      });
      await tx.ledgerEntry.create({
        data: {
          marketId: toAccount.marketId,
          accountId: toAccount.id,
          currencyId: toAccount.currencyId,
          direction: 'IN',
          amount: receivedAmount,
          balanceAfter: updatedToAccount.balance,
          entryDate: accountTransfer.transferDate,
          description: `انتقال از حساب «${fromAccount.name}»${rateNote}`,
          accountTransferId: accountTransfer.id,
          createdById: actor.id,
        },
      });

      return {
        transfer: accountTransfer,
        fromAccount: updatedFromAccount,
        toAccount: updatedToAccount,
      };
    });
  }

  async findAllTransfers(currentUser: { id: string }, query: TransferQueryDto) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ مارکتی متصل نیست');
    }
    const where: any =
      actor.role === 'SUPER_ADMIN' ? {} : { marketId: actor.marketId! };

    if (query.accountId) {
      where.OR = [
        { fromAccountId: query.accountId },
        { toAccountId: query.accountId },
      ];
    }
    if (query.fromAccountId) where.fromAccountId = query.fromAccountId;
    if (query.toAccountId) where.toAccountId = query.toAccountId;

    const searchWhere = buildSearchWhere(AccountsService.TRANSFER_SEARCH_FIELDS, query.search);
    if (searchWhere) where.AND = [searchWhere];

    const orderBy = resolveSort(
      query.sortBy,
      query.sortOrder,
      AccountsService.TRANSFER_SORT_FIELDS,
      { transferDate: 'desc' },
    );

    return paginate(this.prisma.accountTransfer, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      include: {
        fromAccount: { select: { id: true, name: true, type: true } },
        toAccount: { select: { id: true, name: true, type: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
  }
}
