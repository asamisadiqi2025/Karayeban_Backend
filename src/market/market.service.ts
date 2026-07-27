import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
// import { Prisma, MarketStatus } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMarketDto } from './dto/create-market.dto';
import { generateId } from '../common/utils/uuid.util';
import { MarketStatus } from 'src/generated/prisma/enums';
import { Prisma } from 'src/generated/prisma/client';

@Injectable()
export class MarketService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createMarketDto: CreateMarketDto, userId: string) {
    const existing = await this.prisma.market.findUnique({
      where: { code: createMarketDto.code },
    });

    if (existing) {
      throw new ConflictException('Market with this code already exists');
    }

    return this.prisma.market.create({
      data: {
        id: generateId(),
        ...createMarketDto,
        createdById: userId,
        updatedById: userId,
      },
    });
  }

  async findAll() {
    return this.prisma.market.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const market = await this.prisma.market.findFirst({
      where: { id, deletedAt: null },
    });

    if (!market) {
      throw new NotFoundException(`Market with ID ${id} not found`);
    }

    return market;
  }

  async update(id: string, body: Record<string, unknown>, userId: string) {
    await this.findOne(id);

    if (!body || typeof body !== 'object') {
      return this.findOne(id);
    }

    if (body.code) {
      const existing = await this.prisma.market.findFirst({
        where: { code: body.code as string, id: { not: id } },
      });

      if (existing) {
        throw new ConflictException('Market with this code already exists');
      }
    }

    const data: Prisma.MarketUpdateInput = { updatedById: userId };

    if (body.name !== undefined) data.name = body.name as string;
    if (body.code !== undefined) data.code = body.code as string;
    if (body.address !== undefined) data.address = body.address as string;
    if (body.phone !== undefined) data.phone = body.phone as string;
    if (body.status !== undefined) data.status = body.status as MarketStatus;

    return this.prisma.market.update({ where: { id }, data });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id);

    await this.prisma.market.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        updatedById: userId,
        status: 'INACTIVE',
      },
    });

    return { message: 'Market deleted successfully' };
  }
}
