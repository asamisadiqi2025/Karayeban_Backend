import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateMarketDto } from './dto/create-market.dto';
import { UpdateMarketProfileDto } from './dto/update-market-profile.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MarketService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async create(currentUser: any, dto: CreateMarketDto) {
    if (!currentUser || currentUser.role !== 'SUPER_ADMIN') throw new ForbiddenException('Only super admin');

    const data: any = {
      name: dto.name,
      address: dto.address,
      phone: dto.phone || null,
      logo: dto.logo || null,
      exchangeRate: dto.exchangeRate || 0,
      hasWater: dto.hasWater || false,
      isSetupComplete: false,
    };

    // map baseCurrency string (code or id) to Prisma nested connect object
    // map `baseCurrency` to a nested connect; default to 'AFN' if not provided
    const baseCode = dto.baseCurrency || 'AFN';
    if (baseCode) {
      data.baseCurrency = { connect: { code: baseCode } };
    }

    const market = await this.prisma.market.create({ data });
    return market;
  }

  async findOne(currentUser: any, id: string) {
    const market = await this.prisma.market.findUnique({ where: { id } });
    if (!market) throw new NotFoundException('Market not found');
    if (currentUser.role !== 'SUPER_ADMIN' && currentUser.marketId !== id) throw new ForbiddenException('Access denied');
    return market;
  }

  async updateProfile(currentUser: any, id: string, dto: UpdateMarketProfileDto) {
    const market = await this.prisma.market.findUnique({ where: { id } });
    if (!market) throw new NotFoundException('Market not found');
    if (currentUser.role !== 'SUPER_ADMIN' && currentUser.marketId !== id) throw new ForbiddenException('Access denied');

    // prepare update payload and map baseCurrency to nested connect when provided
    const { baseCurrency, ...rest } = dto as any;
    const updateData: any = { ...rest };
    if (baseCurrency) updateData.baseCurrency = { connect: { code: baseCurrency } };

    const updated = await this.prisma.market.update({ where: { id }, data: updateData });
    return updated;
  }

  async findAll(currentUser: any) {
    if (currentUser.role === 'SUPER_ADMIN') return this.prisma.market.findMany();
    if (!currentUser.marketId) throw new NotFoundException('User has no market');
    const market = await this.prisma.market.findUnique({ where: { id: currentUser.marketId } });
    return [market];
  }
}
 