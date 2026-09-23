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
import { paginate, resolveSort, buildSearchWhere } from '../../common/utils/pagination';
import { CreateShareholderDto } from './dto/create-shareholder.dto';
import { UpdateShareholderDto } from './dto/update-shareholder.dto';
import { ShareholderQueryDto } from './dto/shareholder-query.dto';
import { SetShareholderEquityDto } from './dto/set-equity.dto';
import { CreateShareholderTransactionDto } from './dto/create-shareholder-transaction.dto';
import { ShareholderTransactionQueryDto } from './dto/shareholder-transaction-query.dto';
import { ShareholderEquitySummaryQueryDto } from './dto/shareholder-equity-summary-query.dto';

type Actor = { id: string; role: string; marketId: string | null };

type CurrencyTotals = {
  currencyId: string;
  currencyCode: string | null;
  totalDeposits: Prisma.Decimal;
  totalWithdrawals: Prisma.Decimal;
  netAmount: Prisma.Decimal;
};

@Injectable()
export class ShareholdersService {
  private static readonly SORT_FIELDS = ['fullName', 'createdAt'] as const;
  private static readonly SEARCH_FIELDS = ['fullName', 'contact', 'idNumber'] as const;
  private static readonly TRANSACTION_SORT_FIELDS = [
    'transactionDate',
    'amount',
    'createdAt',
  ] as const;
  private static readonly TRANSACTION_SEARCH_FIELDS = [
    'details',
    'receiptNumber',
    'shareholder.fullName',
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

  private ensureAccess(actor: Actor, shareholderMarketId: string) {
    if (actor.role === 'SUPER_ADMIN') return;
    if (actor.marketId !== shareholderMarketId) {
      throw new ForbiddenException('دسترسی به این سهام‌دار مجاز نیست');
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

  // همان درس Guarantor/Tenant: به‌جای پیام مبهم، خودِ سهام‌دارِ از‌قبل‌ثبت‌شده را معرفی می‌کنیم.
  private async handleIdNumberConflict(
    e: any,
    marketId: string,
    idNumber: string | undefined,
  ): Promise<never> {
    const adapterFields: string[] = e.meta?.driverAdapterError?.cause?.constraint?.fields ?? [];
    const classicTarget = e.meta?.target;
    const classicFields: string[] = Array.isArray(classicTarget)
      ? classicTarget
      : typeof classicTarget === 'string'
        ? [classicTarget]
        : [];
    const fields = [...adapterFields, ...classicFields];

    if (fields.includes('id_number') && idNumber) {
      const existing = await this.prisma.shareholder.findFirst({
        where: { marketId, idNumber },
        select: { id: true, fullName: true },
      });
      throw new ConflictException(
        existing
          ? `سهام‌داری با شمارهٔ تذکرهٔ «${idNumber}» قبلاً با نام «${existing.fullName}» ثبت شده (شناسه: ${existing.id}) — به‌جای ساختن رکورد جدید، از همان سهام‌دار استفاده کنید`
          : `شمارهٔ تذکرهٔ «${idNumber}» در این بازار قبلاً ثبت شده است`,
      );
    }
    throw new ConflictException('این مقدار در این بازار از قبل ثبت شده است');
  }

  // آخرین درصد ثبت‌شده برای یک سهام‌دار (بر اساس effectiveFrom)، یا صفر اگر هیچ‌وقت ثبت نشده.
  private async getCurrentPercentage(shareholderId: string): Promise<Prisma.Decimal> {
    const latest = await this.prisma.shareholderEquity.findFirst({
      where: { shareholderId },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      select: { percentage: true },
    });
    return latest?.percentage ?? new Prisma.Decimal(0);
  }

  // مجموع واریز/برداشت‌های ثبت‌شده — فقط جمع‌بندیِ نمایشی؛ حساب‌داری نهایی به‌عهدهٔ حساب‌دار است.
  private async getTransactionTotals(shareholderId: string) {
    const [deposits, withdrawals] = await Promise.all([
      this.prisma.shareholderTransaction.aggregate({
        where: { shareholderId, type: 'DEPOSIT' },
        _sum: { amount: true },
      }),
      this.prisma.shareholderTransaction.aggregate({
        where: { shareholderId, type: 'WITHDRAWAL' },
        _sum: { amount: true },
      }),
    ]);
    const totalDeposits = deposits._sum.amount ?? new Prisma.Decimal(0);
    const totalWithdrawals = withdrawals._sum.amount ?? new Prisma.Decimal(0);
    return {
      totalDeposits,
      totalWithdrawals,
      netAmount: totalDeposits.sub(totalWithdrawals),
    };
  }

  private async enrich<T extends { id: string }>(shareholder: T) {
    const [currentPercentage, totals] = await Promise.all([
      this.getCurrentPercentage(shareholder.id),
      this.getTransactionTotals(shareholder.id),
    ]);
    return { ...shareholder, currentPercentage, ...totals };
  }

  async create(currentUser: { id: string }, dto: CreateShareholderDto) {
    const actor = await this.getActor(currentUser);
    const marketId = this.resolveMarketId(actor, dto.marketId);

    await ensureMarketSetupComplete(this.prisma, marketId);

    const idNumber = dto.idNumber?.trim() || undefined;

    try {
      return await this.prisma.shareholder.create({
        data: {
          marketId,
          fullName: dto.fullName.trim(),
          contact: dto.contact?.trim() || null,
          idNumber: idNumber ?? null,
        },
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        await this.handleIdNumberConflict(e, marketId, idNumber);
      }
      throw e;
    }
  }

  async findAll(currentUser: { id: string }, query: ShareholderQueryDto) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }
    const where: any =
      actor.role === 'SUPER_ADMIN' ? {} : { marketId: actor.marketId! };

    if (query.isActive !== undefined) where.isActive = query.isActive;

    const searchWhere = buildSearchWhere(ShareholdersService.SEARCH_FIELDS, query.search);
    if (searchWhere) where.AND = [searchWhere];

    const orderBy = resolveSort(query.sortBy, query.sortOrder, ShareholdersService.SORT_FIELDS, {
      fullName: 'asc',
    });

    const result = await paginate(this.prisma.shareholder, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
    });
    const data = await Promise.all(result.data.map((s) => this.enrich(s)));
    return { ...result, data };
  }

  async findOne(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const shareholder = await this.prisma.shareholder.findUnique({ where: { id } });
    if (!shareholder) throw new NotFoundException('سهام‌دار یافت نشد');
    this.ensureAccess(actor, shareholder.marketId);

    return this.enrich(shareholder);
  }

  async update(currentUser: { id: string }, id: string, dto: UpdateShareholderDto) {
    const actor = await this.getActor(currentUser);
    const shareholder = await this.prisma.shareholder.findUnique({ where: { id } });
    if (!shareholder) throw new NotFoundException('سهام‌دار یافت نشد');
    this.ensureAccess(actor, shareholder.marketId);

    const data: Record<string, unknown> = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName.trim();
    if (dto.contact !== undefined) data.contact = dto.contact?.trim() || null;
    if (dto.idNumber !== undefined) data.idNumber = dto.idNumber?.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      return await this.prisma.shareholder.update({ where: { id }, data });
    } catch (e: any) {
      if (e.code === 'P2002') {
        await this.handleIdNumberConflict(e, shareholder.marketId, dto.idNumber?.trim());
      }
      throw e;
    }
  }

  async remove(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const shareholder = await this.prisma.shareholder.findUnique({ where: { id } });
    if (!shareholder) throw new NotFoundException('سهام‌دار یافت نشد');
    this.ensureAccess(actor, shareholder.marketId);

    const [transactionsCount, equityCount] = await Promise.all([
      this.prisma.shareholderTransaction.count({ where: { shareholderId: id } }),
      this.prisma.shareholderEquity.count({ where: { shareholderId: id } }),
    ]);

    if (transactionsCount > 0 || equityCount > 0) {
      throw new ConflictException(
        'این سهام‌دار دارای تراکنش یا سابقهٔ سهم است و قابل حذف نیست؛ در عوض می‌توانید آن را غیرفعال کنید',
      );
    }

    await this.prisma.shareholder.delete({ where: { id } });
    return { message: `سهام‌دار «${shareholder.fullName}» حذف شد` };
  }

  // ثبت/آپدیت فیصد سهم یک سهام‌دار — بدون هیچ چک ریاضی‌ای رو بقیهٔ سهام‌داران؛ فقط یک
  // ردیف جدید در تاریخچه ثبت می‌شود (طبق همون قاعدهٔ همیشگی: هیچ ردیف قدیمی پاک/عوض نمی‌شود).
  // محاسبهٔ اینکه جمع همهٔ سهام‌داران باید ۱۰۰ باشد، فعلاً به‌عهدهٔ حساب‌دار است، نه سیستم.
  async setEquity(currentUser: { id: string }, id: string, dto: SetShareholderEquityDto) {
    const actor = await this.getActor(currentUser);
    const shareholder = await this.prisma.shareholder.findUnique({ where: { id } });
    if (!shareholder) throw new NotFoundException('سهام‌دار یافت نشد');
    this.ensureAccess(actor, shareholder.marketId);

    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();

    await this.prisma.shareholderEquity.create({
      data: {
        shareholderId: id,
        percentage: dto.percentage,
        effectiveFrom,
        notes: dto.notes?.trim() || null,
        createdById: actor.id,
      },
    });

    return this.enrich(shareholder);
  }

  // ثبت واریز/برداشت — دقیقاً همان الگوی atomic و ledger-محورِ AccountsService.transfer():
  // موجودی حساب را داخل یک تراکنش تغییر می‌دهد و یک LedgerEntry متناظر می‌سازد.
  async createTransaction(
    currentUser: { id: string },
    shareholderId: string,
    dto: CreateShareholderTransactionDto,
  ) {
    const actor = await this.getActor(currentUser);
    const shareholder = await this.prisma.shareholder.findUnique({
      where: { id: shareholderId },
    });
    if (!shareholder) throw new NotFoundException('سهام‌دار یافت نشد');
    this.ensureAccess(actor, shareholder.marketId);
    if (!shareholder.isActive) {
      throw new ConflictException('سهام‌دار غیرفعال است');
    }

    const account = await this.prisma.account.findUnique({
      where: { id: dto.accountId },
    });
    if (!account) throw new NotFoundException('حساب یافت نشد');
    if (account.marketId !== shareholder.marketId) {
      throw new BadRequestException('حساب باید متعلق به همان بازارِ سهام‌دار باشد');
    }
    if (!account.isActive) {
      throw new ConflictException('حساب غیرفعال است');
    }

    const amount = new Prisma.Decimal(dto.amount);
    const transactionDate = dto.transactionDate ? new Date(dto.transactionDate) : new Date();
    const isWithdrawal = dto.type === 'WITHDRAWAL';

    return this.prisma.$transaction(async (tx) => {
      let updatedAccount;
      if (isWithdrawal) {
        // کاهش اتمیک؛ شرط balance >= amount مستقیم در WHERE چک می‌شود.
        const debited = await tx.account.updateMany({
          where: { id: account.id, balance: { gte: amount } },
          data: { balance: { decrement: amount } },
        });
        if (debited.count === 0) {
          throw new ConflictException(
            `موجودی حساب «${account.name}» برای این برداشت کافی نیست`,
          );
        }
        updatedAccount = await tx.account.findUniqueOrThrow({ where: { id: account.id } });
      } else {
        updatedAccount = await tx.account.update({
          where: { id: account.id },
          data: { balance: { increment: amount } },
        });
      }

      const transaction = await tx.shareholderTransaction.create({
        data: {
          marketId: shareholder.marketId,
          shareholderId: shareholder.id,
          accountId: account.id,
          type: dto.type,
          amount,
          transactionDate,
          receiptNumber: dto.receiptNumber?.trim() || null,
          details: dto.details?.trim() || null,
          createdById: actor.id,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          marketId: shareholder.marketId,
          accountId: account.id,
          currencyId: account.currencyId,
          direction: isWithdrawal ? 'OUT' : 'IN',
          amount,
          balanceAfter: updatedAccount.balance,
          entryDate: transactionDate,
          description: isWithdrawal
            ? `برداشت سهام‌دار «${shareholder.fullName}»`
            : `واریز سرمایه از سهام‌دار «${shareholder.fullName}»`,
          shareholderTransactionId: transaction.id,
          createdById: actor.id,
        },
      });

      return { transaction, account: updatedAccount };
    });
  }

  async findAllTransactions(
    currentUser: { id: string },
    query: ShareholderTransactionQueryDto,
  ) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }
    const where: any =
      actor.role === 'SUPER_ADMIN' ? {} : { marketId: actor.marketId! };

    if (query.shareholderId !== undefined) where.shareholderId = query.shareholderId;
    if (query.accountId !== undefined) where.accountId = query.accountId;
    if (query.type !== undefined) where.type = query.type;

    const searchWhere = buildSearchWhere(
      ShareholdersService.TRANSACTION_SEARCH_FIELDS,
      query.search,
    );
    if (searchWhere) where.AND = [searchWhere];

    const orderBy = resolveSort(
      query.sortBy,
      query.sortOrder,
      ShareholdersService.TRANSACTION_SORT_FIELDS,
      { transactionDate: 'desc' },
    );

    return paginate(this.prisma.shareholderTransaction, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      include: {
        shareholder: { select: { id: true, fullName: true } },
        account: { select: { id: true, name: true, type: true } },
      },
    });
  }

  // ==========================================================================
  // خلاصهٔ سهام‌داران — همهٔ سهام‌داران یک بازار یک‌جا، به‌جای اینکه یکی‌یکی findOne بزنی.
  // برخلاف enrich() (که برای هر سهام‌دار دو کوئریِ جدا می‌زند: یکی برای آخرین درصدِ سهم،
  // یکی برای مجموع واریز/برداشت — قابل‌قبول برای یک صفحهٔ ۲۰تایی، ولی N+1 واقعی برای
  // «همهٔ سهام‌داران»)، این‌جا برای هر دو، فقط یک کوئریِ batched روی همهٔ شناسه‌ها با هم
  // زده می‌شود؛ تعداد کوئری‌ها دیگر به تعدادِ سهام‌داران وابسته نیست.
  //
  // چرا جمع‌بندیِ تراکنش‌ها در حافظه، نه groupBy: ShareholderTransaction خودش ستونِ
  // currencyId ندارد — ارز از رویِ Account متصل معلوم می‌شود، و Prisma نمی‌تواند در سطحِ
  // groupBy روی فیلدِ یک رابطه (account.currencyId) گروه بزند. چون تعدادِ تراکنش‌های
  // سرمایه‌ایِ سهام‌داران (واریز/برداشتِ سرمایه) طبیعتاً کم و پراکنده است — نه هر روز مثل
  // کرایه —، خواندن و جمع در حافظه کاملاً امن و مقیاس‌پذیر می‌ماند.
  async getEquitySummary(currentUser: { id: string }, query: ShareholderEquitySummaryQueryDto) {
    const actor = await this.getActor(currentUser);
    const marketId = this.resolveMarketId(actor, query.marketId);

    const shareholders = await this.prisma.shareholder.findMany({
      where: { marketId },
      select: { id: true, fullName: true, isActive: true },
      orderBy: { fullName: 'asc' },
    });
    const shareholderIds = shareholders.map((s) => s.id);

    if (shareholderIds.length === 0) {
      return {
        marketId,
        equityPercentageSum: new Prisma.Decimal(0),
        isBalanced: true,
        grandTotalsByCurrency: [] as CurrencyTotals[],
        shareholders: [],
      };
    }

    const [equityHistory, transactions] = await Promise.all([
      this.prisma.shareholderEquity.findMany({
        where: { shareholderId: { in: shareholderIds } },
        orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }],
        select: { shareholderId: true, percentage: true },
      }),
      this.prisma.shareholderTransaction.findMany({
        where: { shareholderId: { in: shareholderIds } },
        select: {
          shareholderId: true,
          type: true,
          amount: true,
          account: { select: { currencyId: true } },
        },
      }),
    ]);

    // چون equityHistory صعودی (effectiveFrom, createdAt) مرتب شده، آخرین ردیفی که برای
    // هر shareholderId می‌بینیم همان جدیدترینِ اوست — یک پیمایشِ خطی، بدون کوئریِ جدا.
    const latestPercentageByShareholder = new Map<string, Prisma.Decimal>();
    for (const row of equityHistory) {
      latestPercentageByShareholder.set(row.shareholderId, row.percentage);
    }

    const currencyIds = [...new Set(transactions.map((t) => t.account.currencyId))];
    const currencies = currencyIds.length
      ? await this.prisma.currency.findMany({
          where: { id: { in: currencyIds } },
          select: { id: true, code: true },
        })
      : [];
    const currencyCodeById = new Map(currencies.map((c) => [c.id, c.code]));

    // shareholderId → currencyId → {deposits, withdrawals}
    const totalsByShareholder = new Map<string, Map<string, { deposits: Prisma.Decimal; withdrawals: Prisma.Decimal }>>();
    const grandByCurrency = new Map<string, { deposits: Prisma.Decimal; withdrawals: Prisma.Decimal }>();
    const zero = new Prisma.Decimal(0);

    for (const tx of transactions) {
      const currencyId = tx.account.currencyId;
      const byCurrency = totalsByShareholder.get(tx.shareholderId) ?? new Map();
      const cell = byCurrency.get(currencyId) ?? { deposits: zero, withdrawals: zero };
      const grandCell = grandByCurrency.get(currencyId) ?? { deposits: zero, withdrawals: zero };

      if (tx.type === 'DEPOSIT') {
        cell.deposits = cell.deposits.add(tx.amount);
        grandCell.deposits = grandCell.deposits.add(tx.amount);
      } else {
        cell.withdrawals = cell.withdrawals.add(tx.amount);
        grandCell.withdrawals = grandCell.withdrawals.add(tx.amount);
      }

      byCurrency.set(currencyId, cell);
      totalsByShareholder.set(tx.shareholderId, byCurrency);
      grandByCurrency.set(currencyId, grandCell);
    }

    const toCurrencyTotals = (
      byCurrency: Map<string, { deposits: Prisma.Decimal; withdrawals: Prisma.Decimal }>,
    ): CurrencyTotals[] =>
      [...byCurrency.entries()].map(([currencyId, v]) => ({
        currencyId,
        currencyCode: currencyCodeById.get(currencyId) ?? null,
        totalDeposits: v.deposits,
        totalWithdrawals: v.withdrawals,
        netAmount: v.deposits.sub(v.withdrawals),
      }));

    let equityPercentageSum = new Prisma.Decimal(0);
    const shareholderRows = shareholders.map((s) => {
      const currentPercentage = latestPercentageByShareholder.get(s.id) ?? zero;
      equityPercentageSum = equityPercentageSum.add(currentPercentage);
      return {
        shareholderId: s.id,
        fullName: s.fullName,
        isActive: s.isActive,
        currentPercentage,
        byCurrency: toCurrencyTotals(totalsByShareholder.get(s.id) ?? new Map()),
      };
    });

    return {
      marketId,
      // اینکه جمعِ درصدها دقیقاً ۱۰۰ است یا نه — تا حالا فقط وظیفهٔ دستیِ حساب‌دار بود
      // (ن.ک. کامنتِ setEquity)؛ این گزارش برای اولین‌بار آن را قابل‌مشاهده می‌کند.
      equityPercentageSum,
      isBalanced: equityPercentageSum.equals(100),
      grandTotalsByCurrency: [...grandByCurrency.entries()].map(([currencyId, v]) => ({
        currencyId,
        currencyCode: currencyCodeById.get(currencyId) ?? null,
        totalDeposits: v.deposits,
        totalWithdrawals: v.withdrawals,
        netAmount: v.deposits.sub(v.withdrawals),
      })),
      shareholders: shareholderRows,
    };
  }
}
