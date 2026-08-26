import { ConflictException, Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateMarketDto } from './dto/create-market.dto';
import { UpdateMarketProfileDto } from './dto/update-market-profile.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MarketService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async create(currentUser: any, dto: CreateMarketDto) {
    if (!currentUser || currentUser.role !== 'SUPER_ADMIN') throw new ForbiddenException('Only super admin');

    const existing = await this.prisma.market.findFirst();
    if (existing) {
      throw new ConflictException('یک مارکت از قبل ساخته شده؛ فقط یک مارکت در سیستم مجاز است. برای تکمیل اطلاعات از ویرایش پروفایل استفاده کنید');
    }

    const currency = await this.prisma.currency.findUnique({ where: { code: dto.baseCurrency } });
    if (!currency) {
      throw new NotFoundException(`ارز "${dto.baseCurrency}" در سیستم ثبت نشده؛ اول آن را از بخش ارزها اضافه کنید`);
    }

     
    const market = await this.prisma.market.create({
      data: {
        name: dto.name,
        address: dto.address,
        logo: dto.logo || null,
        phones: dto.phones ?? [],
        emails: dto.emails ?? [],
        baseCurrency: { connect: { id: currency.id } },
        isSetupComplete: true,
      },
    });
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

     const { baseCurrency, ...rest } = dto as any;
    const updateData: any = { ...rest };
    if (baseCurrency) {
      if (market.baseCurrencyId) {
        throw new ConflictException('ارز پایه بعد از تنظیم اولیه قابل تغییر نیست');
      }
      updateData.baseCurrency = { connect: { code: baseCurrency } };
    }

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
 