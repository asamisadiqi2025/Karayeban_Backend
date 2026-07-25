import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { generateId } from '../common/utils/uuid.util';
import { createPagination, createPaginationResponse } from '../common/pagination';
import type { AuthUser } from '../auth/types/jwt-payload.type';
import { CreateMarketDto } from './dto/create-market.dto';
import { UpdateMarketDto } from './dto/update-market.dto';
import { QueryMarketDto } from './dto/query-market.dto';

const MARKET_COUNT_SELECT = {
  _count: {
    select: {
      floors: true,
      shops: true,
      contracts: true,
      marketEmployees: true,
      marketExpenses: true,
      accounts: true,
      journalEntries: true,
      cheques: true,
      documents: true,
      users: true,
      shareholders: true,
      approvalRequests: true,
      maintenanceRequests: true,
      securityDeposits: true,
    },
  },
} satisfies Prisma.MarketSelect;

type MarketWithCounts = Prisma.MarketGetPayload<{
  select: typeof MARKET_COUNT_SELECT;
}>;

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthUser, query: QueryMarketDto) {
    const { page, limit, skip } = createPagination(query);

    const where: Prisma.MarketWhereInput = {
      deletedAt: null,
    };

    if (!user.isSuperAdmin && user.marketId) {
      where.id = user.marketId;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    const [markets, total] = await Promise.all([
      this.prisma.market.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          code: true,
          address: true,
          phone: true,
          status: true,
          createdById: true,
          updatedById: true,
          createdAt: true,
          updatedAt: true,
          version: true,
          ...MARKET_COUNT_SELECT,
        },
      }),
      this.prisma.market.count({ where }),
    ]);

    return createPaginationResponse(markets, total, page, limit);
  }

  async findOne(user: AuthUser, id: string) {
    const market = await this.prisma.market.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        phone: true,
        status: true,
        createdById: true,
        updatedById: true,
        createdAt: true,
        updatedAt: true,
        version: true,
        ...MARKET_COUNT_SELECT,
      },
    });

    if (!market) {
      throw new NotFoundException('بازار يافت نشد.');
    }

    if (!user.isSuperAdmin && user.marketId !== market.id) {
      throw new NotFoundException('بازار يافت نشد.');
    }

    return market;
  }

  async create(dto: CreateMarketDto, userId?: string) {
    const existingMarket = await this.prisma.market.findFirst({
      where: {
        code: dto.code.trim().toUpperCase(),
        deletedAt: null,
      },
    });

    if (existingMarket) {
      throw new ConflictException('بازاري با اين کد قبلاً ثبت شده است.');
    }

    const market = await this.prisma.market.create({
      data: {
        id: generateId(),
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        address: dto.address?.trim() || null,
        phone: dto.phone?.trim() || null,
        status: dto.status ?? 'ACTIVE',
        createdById: userId ?? null,
        updatedById: userId ?? null,
      },
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        phone: true,
        status: true,
        createdById: true,
        updatedById: true,
        createdAt: true,
        updatedAt: true,
        version: true,
        ...MARKET_COUNT_SELECT,
      },
    });

    this.logger.log(`Market created: ${market.name} (${market.id})`);

    return market;
  }

  async update(user: AuthUser, id: string, dto: UpdateMarketDto) {
    const market = await this.prisma.market.findFirst({
      where: { id, deletedAt: null },
    });

    if (!market) {
      throw new NotFoundException('بازار يافت نشد.');
    }

    if (!user.isSuperAdmin && user.marketId !== market.id) {
      throw new NotFoundException('بازار يافت نشد.');
    }

    if (dto.code && dto.code.trim().toUpperCase() !== market.code) {
      const existingMarket = await this.prisma.market.findFirst({
        where: {
          code: dto.code.trim().toUpperCase(),
          deletedAt: null,
          id: { not: id },
        },
      });

      if (existingMarket) {
        throw new ConflictException('بازاري با اين کد قبلاً ثبت شده است.');
      }
    }

    const updateData: Prisma.MarketUpdateInput = {
      version: { increment: 1 },
      updatedById: user.id,
    };

    if (dto.name !== undefined) updateData.name = dto.name.trim();
    if (dto.code !== undefined) updateData.code = dto.code.trim().toUpperCase();
    if (dto.address !== undefined) updateData.address = dto.address?.trim() || null;
    if (dto.phone !== undefined) updateData.phone = dto.phone?.trim() || null;
    if (dto.status !== undefined) updateData.status = dto.status;

    const updatedMarket = await this.prisma.market.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        phone: true,
        status: true,
        createdById: true,
        updatedById: true,
        createdAt: true,
        updatedAt: true,
        version: true,
        ...MARKET_COUNT_SELECT,
      },
    });

    this.logger.log(`Market updated: ${updatedMarket.name} (${updatedMarket.id}) by user ${user.id}`);

    return updatedMarket;
  }

  async remove(user: AuthUser, id: string) {
    const market = await this.prisma.market.findFirst({
      where: { id, deletedAt: null },
    });

    if (!market) {
      throw new NotFoundException('بازار يافت نشد.');
    }

    if (!user.isSuperAdmin && user.marketId !== market.id) {
      throw new NotFoundException('بازار يافت نشد.');
    }

    const deletedMarket = await this.prisma.market.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'CLOSED',
        version: { increment: 1 },
        updatedById: user.id,
      },
      select: {
        id: true,
        name: true,
        code: true,
        status: true,
        deletedAt: true,
        updatedAt: true,
        version: true,
      },
    });

    this.logger.log(`Market soft-deleted: ${deletedMarket.name} (${deletedMarket.id}) by user ${user.id}`);

    return deletedMarket;
  }
}
