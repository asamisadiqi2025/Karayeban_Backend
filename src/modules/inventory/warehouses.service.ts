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
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehouseQueryDto } from './dto/warehouse-query.dto';

type Actor = { id: string; role: string; marketId: string | null };

@Injectable()
export class WarehousesService {
  private static readonly SORT_FIELDS = ['name', 'createdAt'] as const;
  private static readonly SEARCH_FIELDS = ['name', 'location'] as const;

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

  private ensureAccess(actor: Actor, warehouseMarketId: string) {
    if (actor.role === 'SUPER_ADMIN') return;
    if (actor.marketId !== warehouseMarketId) {
      throw new ForbiddenException('دسترسی به این گدام مجاز نیست');
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

  private async findActiveOrThrow(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse || warehouse.isDeleted) throw new NotFoundException('گدام یافت نشد');
    return warehouse;
  }

  async create(currentUser: { id: string }, dto: CreateWarehouseDto) {
    const actor = await this.getActor(currentUser);
    const marketId = this.resolveMarketId(actor, dto.marketId);

    await ensureMarketSetupComplete(this.prisma, marketId);

    try {
      return await this.prisma.warehouse.create({
        data: {
          marketId,
          name: dto.name.trim(),
          details: dto.details?.trim() || null,
          location: dto.location?.trim() || null,
        },
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException('گدامی با همین نام در این بازار قبلاً ثبت شده است');
      }
      throw e;
    }
  }

  async findAll(currentUser: { id: string }, query: WarehouseQueryDto) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }
    const where: any = {
      isDeleted: false,
      ...(actor.role === 'SUPER_ADMIN' ? {} : { marketId: actor.marketId! }),
    };

    if (query.isActive !== undefined) where.isActive = query.isActive;

    const searchWhere = buildSearchWhere(WarehousesService.SEARCH_FIELDS, query.search);
    if (searchWhere) where.AND = [searchWhere];

    const orderBy = resolveSort(query.sortBy, query.sortOrder, WarehousesService.SORT_FIELDS, {
      name: 'asc',
    });

    return paginate(this.prisma.warehouse, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
    });
  }

  async findOne(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const warehouse = await this.findActiveOrThrow(id);
    this.ensureAccess(actor, warehouse.marketId);
    return warehouse;
  }

  async update(currentUser: { id: string }, id: string, dto: UpdateWarehouseDto) {
    const actor = await this.getActor(currentUser);
    const warehouse = await this.findActiveOrThrow(id);
    this.ensureAccess(actor, warehouse.marketId);

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.location !== undefined) data.location = dto.location?.trim() || null;
    if (dto.details !== undefined) data.details = dto.details?.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      return await this.prisma.warehouse.update({ where: { id }, data });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException('گدامی با همین نام در این بازار قبلاً ثبت شده است');
      }
      throw e;
    }
  }

  async remove(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const warehouse = await this.findActiveOrThrow(id);
    this.ensureAccess(actor, warehouse.marketId);

    const itemsCount = await this.prisma.inventoryItem.count({
      where: { warehouseId: id, isDeleted: false },
    });
    if (itemsCount > 0) {
      throw new ConflictException(
        'این گدام دارای کالای ثبت‌شده است و قابل حذف نیست؛ ابتدا کالاها را جابه‌جا یا حذف کنید',
      );
    }

    await this.prisma.warehouse.update({ where: { id }, data: { isDeleted: true } });
    return { message: `گدام «${warehouse.name}» حذف شد` };
  }
}
