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
import { CreateFloorDto } from './dto/create-floor.dto';
import { UpdateFloorDto } from './dto/update-floor.dto';
import { FloorQueryDto } from './dto/floor-query.dto';

type Actor = { id: string; role: string; marketId: string | null };

@Injectable()
export class FloorsService {
  private static readonly SORT_FIELDS = ['floorNumber', 'name', 'createdAt'] as const;
  private static readonly SEARCH_FIELDS = ['name'] as const;

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

  private ensureAccess(actor: Actor, floorMarketId: string) {
    if (actor.role === 'SUPER_ADMIN') return;
    if (actor.marketId !== floorMarketId) {
      throw new ForbiddenException('دسترسی به این طبقه مجاز نیست');
    }
  }

  private mapFloor<T extends { _count: { shops: number } }>(floor: T) {
    const { _count, ...rest } = floor;
    return { ...rest, shopsCount: _count.shops };
  }

  async create(currentUser: { id: string }, dto: CreateFloorDto) {
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

    try {
      const floor = await this.prisma.floor.create({
        data: {
          marketId,
          floorNumber: dto.floorNumber,
          name: dto.name?.trim() || null,
          details: dto.details?.trim() || null,
        },
        include: { _count: { select: { shops: true } } },
      });
      return this.mapFloor(floor);
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException(
          `طبقهٔ شمارهٔ «${dto.floorNumber}» در این بازار از قبل وجود دارد`,
        );
      }
      throw e;
    }
  }

  async findAll(currentUser: { id: string }, query: FloorQueryDto) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }
    const where: any =
      actor.role === 'SUPER_ADMIN' ? {} : { marketId: actor.marketId! };
    if (query.isActive !== undefined) where.isActive = query.isActive;

    const searchWhere = buildSearchWhere(FloorsService.SEARCH_FIELDS, query.search);
    if (searchWhere) Object.assign(where, searchWhere);

    const orderBy = resolveSort(query.sortBy, query.sortOrder, FloorsService.SORT_FIELDS, {
      floorNumber: 'asc',
    });

    const result = await paginate(this.prisma.floor, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      include: { _count: { select: { shops: true } } },
    });

    return { ...result, data: result.data.map((floor: any) => this.mapFloor(floor)) };
  }

  async findOne(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const floor = await this.prisma.floor.findUnique({
      where: { id },
      include: { _count: { select: { shops: true } } },
    });
    if (!floor) throw new NotFoundException('طبقه یافت نشد');
    this.ensureAccess(actor, floor.marketId);
    return this.mapFloor(floor);
  }

  async update(currentUser: { id: string }, id: string, dto: UpdateFloorDto) {
    const actor = await this.getActor(currentUser);
    const floor = await this.prisma.floor.findUnique({ where: { id } });
    if (!floor) throw new NotFoundException('طبقه یافت نشد');
    this.ensureAccess(actor, floor.marketId);

    const data: Record<string, unknown> = {};
    if (dto.floorNumber !== undefined) data.floorNumber = dto.floorNumber;
    if (dto.name !== undefined) data.name = dto.name?.trim() || null;
    if (dto.details !== undefined) data.details = dto.details?.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      const updated = await this.prisma.floor.update({
        where: { id },
        data,
        include: { _count: { select: { shops: true } } },
      });
      return this.mapFloor(updated);
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException(
          `طبقهٔ شمارهٔ «${dto.floorNumber}» در این بازار از قبل وجود دارد`,
        );
      }
      throw e;
    }
  }

  async remove(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const floor = await this.prisma.floor.findUnique({
      where: { id },
      include: { _count: { select: { shops: true } } },
    });
    if (!floor) throw new NotFoundException('طبقه یافت نشد');
    this.ensureAccess(actor, floor.marketId);

    if (floor._count.shops > 0) {
      throw new ConflictException(
        `این طبقه دارای ${floor._count.shops} دوکان است و قابل حذف نیست؛ ابتدا دوکان‌ها را جابه‌جا کنید یا این طبقه را غیرفعال کنید`,
      );
    }

    await this.prisma.floor.delete({ where: { id } });
    return { message: `طبقهٔ شمارهٔ «${floor.floorNumber}» حذف شد` };
  }
}
