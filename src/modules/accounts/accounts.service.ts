import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

type Actor = { id: string; role: string; marketId: string | null };

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  // JWT در حال حاضر marketId را حمل نمی‌کند (ن.ک. jwt.strategy.ts)،
  // پس همیشه از دیتابیس تازه خوانده می‌شود تا نقش/بازار واقعی کاربر معلوم باشد.
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
        throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
      }
      marketId = actor.marketId;
    }

    const currency = await this.prisma.currency.findUnique({ where: { id: dto.currencyId } });
    if (!currency) throw new NotFoundException('ارز مورد نظر یافت نشد');

    const openingAmount = dto.openingBalance?.amount ?? 0;
    const openingDate = dto.openingBalance?.openingDate ? new Date(dto.openingBalance.openingDate) : new Date();

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
              baseCurrencyAmount: dto.openingBalance?.baseCurrencyAmount ?? null,
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
        throw new ConflictException(`حسابی با نام «${dto.name}» در این بازار از قبل وجود دارد`);
      }
      throw e;
    }
  }

  async findAll(currentUser: { id: string }) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }
    const where = actor.role === 'SUPER_ADMIN' ? {} : { marketId: actor.marketId! };
    return this.prisma.account.findMany({ where, orderBy: { createdAt: 'asc' } });
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
    if (dto.bankName !== undefined) data.bankName = dto.bankName?.trim() || null;
    if (dto.accountNumber !== undefined) data.accountNumber = dto.accountNumber?.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      return await this.prisma.account.update({ where: { id }, data });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException(`حسابی با نام «${dto.name}» در این بازار از قبل وجود دارد`);
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
}
