import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ensureMarketSetupComplete } from '../../common/utils/ensure-market-setup-complete';
import { paginate, resolveSort, buildSearchWhere } from '../../common/utils/pagination';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { ShopQueryDto } from './dto/shop-query.dto';

type Actor = { id: string; role: string; marketId: string | null };

const FLOOR_SELECT = { id: true, floorNumber: true, name: true } as const;

@Injectable()
export class ShopsService {
  private static readonly SORT_FIELDS = ['shopNumber', 'area', 'createdAt'] as const;
  private static readonly SEARCH_FIELDS = ['shopNumber', 'location', 'floor.name'] as const;

  constructor(private readonly prisma: PrismaService) {}

  
  private async getActor(currentUser: { id: string }): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, role: true, marketId: true },
    });
    if (!user) throw new ForbiddenException('کاربر معتبر نیست');
    return user;
  }

  private ensureAccess(actor: Actor, shopMarketId: string) {
    if (actor.role === 'SUPER_ADMIN') return;
    if (actor.marketId !== shopMarketId) {
      throw new ForbiddenException('دسترسی به این دوکان مجاز نیست');
    }
  }

//  Pervent connect a shop to another floor not belong
  private async ensureFloorBelongsToMarket(floorId: string, marketId: string) {
    const floor = await this.prisma.floor.findUnique({
      where: { id: floorId },
      select: { marketId: true },
    });
    if (!floor) throw new NotFoundException('طبقه یافت نشد');
    if (floor.marketId !== marketId) {
      throw new BadRequestException('این طبقه متعلق به این بازار نیست');
    }
  }

  async create(currentUser: { id: string }, dto: CreateShopDto) {
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

    await ensureMarketSetupComplete(this.prisma, marketId);

    if (dto.floorId) {
      await this.ensureFloorBelongsToMarket(dto.floorId, marketId);
    }

    try {
      return await this.prisma.shop.create({
        data: {
          marketId,
          floorId: dto.floorId ?? null,
          shopNumber: dto.shopNumber.trim(),
          area: dto.area,
          location: dto.location?.trim() || null,
          type: dto.type,
          details: dto.details?.trim() || null,
        },
        include: { floor: { select: FLOOR_SELECT } },
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException(
          `دوکان شمارهٔ «${dto.shopNumber}» در این بازار از قبل وجود دارد`,
        );
      }
      throw e;
    }
  }

  async findAll(currentUser: { id: string }, query: ShopQueryDto) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }
    const where: any =
      actor.role === 'SUPER_ADMIN' ? {} : { marketId: actor.marketId! };

    if (query.type !== undefined) where.type = query.type;
    if (query.status !== undefined) where.status = query.status;
    if (query.floorId !== undefined) where.floorId = query.floorId;
    if (query.isActive !== undefined) where.isActive = query.isActive;

    const searchWhere = buildSearchWhere(ShopsService.SEARCH_FIELDS, query.search);
    if (searchWhere) where.AND = [searchWhere];

     
    const orderBy = resolveSort(query.sortBy, query.sortOrder, ShopsService.SORT_FIELDS, [
      { floor: { floorNumber: 'asc' } },
      { shopNumber: 'asc' },
    ]);

    return paginate(this.prisma.shop, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      include: { floor: { select: FLOOR_SELECT } },
    });
  }

  async findOne(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const shop = await this.prisma.shop.findUnique({
      where: { id },
      include: { floor: { select: FLOOR_SELECT } },
    });
    if (!shop) throw new NotFoundException('دوکان یافت نشد');
    this.ensureAccess(actor, shop.marketId);
    return shop;
  }

  async update(currentUser: { id: string }, id: string, dto: UpdateShopDto) {
    const actor = await this.getActor(currentUser);
    const shop = await this.prisma.shop.findUnique({ where: { id } });
    if (!shop) throw new NotFoundException('دوکان یافت نشد');
    this.ensureAccess(actor, shop.marketId);

    if (dto.floorId) {
      await this.ensureFloorBelongsToMarket(dto.floorId, shop.marketId);
    }

    const data: Record<string, unknown> = {};
    if (dto.shopNumber !== undefined) data.shopNumber = dto.shopNumber.trim();
    if (dto.floorId !== undefined) data.floorId = dto.floorId;
    if (dto.area !== undefined) data.area = dto.area;
    if (dto.location !== undefined) data.location = dto.location?.trim() || null;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.details !== undefined) data.details = dto.details?.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      return await this.prisma.shop.update({
        where: { id },
        data,
        include: { floor: { select: FLOOR_SELECT } },
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException(
          `دوکان شمارهٔ «${dto.shopNumber}» در این بازار از قبل وجود دارد`,
        );
      }
      throw e;
    }
  }

  async remove(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const shop = await this.prisma.shop.findUnique({ where: { id } });
    if (!shop) throw new NotFoundException('دوکان یافت نشد');
    this.ensureAccess(actor, shop.marketId);

    const [
      contractsCount,
      contractShopsCount,
      rentPaymentsCount,
      rentChargesCount,
      electricityMetersCount,
      electricityBillsCount,
      electricityPaymentsCount,
      shopGroupMembersCount,
      lotteryEntriesCount,
    ] = await Promise.all([
      this.prisma.contract.count({ where: { shopId: id } }),
      this.prisma.contractShop.count({ where: { shopId: id } }),
      this.prisma.rentPayment.count({ where: { shopId: id } }),
      this.prisma.rentCharges.count({ where: { shopId: id } }),
      this.prisma.electricityMeter.count({ where: { shopId: id } }),
      this.prisma.electricityBill.count({ where: { shopId: id } }),
      this.prisma.electricityPayment.count({ where: { shopId: id } }),
      this.prisma.shopGroupMember.count({ where: { shopId: id } }),
      this.prisma.lotteryEntry.count({ where: { shopId: id } }),
    ]);

    const hasRelations =
      contractsCount > 0 ||
      contractShopsCount > 0 ||
      rentPaymentsCount > 0 ||
      rentChargesCount > 0 ||
      electricityMetersCount > 0 ||
      electricityBillsCount > 0 ||
      electricityPaymentsCount > 0 ||
      shopGroupMembersCount > 0 ||
      lotteryEntriesCount > 0;

    if (hasRelations) {
      throw new ConflictException(
        'این دوکان دارای قرارداد یا سابقهٔ تراکنش است و قابل حذف نیست؛ در عوض می‌توانید آن را غیرفعال کنید',
      );
    }

    await this.prisma.shop.delete({ where: { id } });
    return { message: `دوکان شمارهٔ «${shop.shopNumber}» حذف شد` };
  }
}

 
