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
import { CreateGuarantorDto } from './dto/create-guarantor.dto';
import { UpdateGuarantorDto } from './dto/update-guarantor.dto';
import { GuarantorQueryDto } from './dto/guarantor-query.dto';

type Actor = { id: string; role: string; marketId: string | null };

@Injectable()
export class GuarantorsService {
  private static readonly SORT_FIELDS = ['name', 'createdAt'] as const;
  private static readonly SEARCH_FIELDS = ['name', 'contact', 'idNumber'] as const;

  constructor(private readonly prisma: PrismaService) {}

   private async getActor(currentUser: { id: string }): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, role: true, marketId: true },
    });
    if (!user) throw new ForbiddenException('کاربر معتبر نیست');
    return user;
  }

  private ensureAccess(actor: Actor, guarantorMarketId: string) {
    if (actor.role === 'SUPER_ADMIN') return;
    if (actor.marketId !== guarantorMarketId) {
      throw new ForbiddenException('دسترسی به این ضامن مجاز نیست');
    }
  }

  
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
      const existing = await this.prisma.guarantor.findFirst({
        where: { marketId, idNumber },
        select: { id: true, name: true },
      });
      throw new ConflictException(
        existing
          ? `ضامنی با شمارهٔ تذکرهٔ «${idNumber}» قبلاً با نام «${existing.name}» ثبت شده (شناسه: ${existing.id}) — به‌جای ساختن رکورد جدید، از همان ضامن استفاده کنید`
          : `شمارهٔ تذکرهٔ «${idNumber}» در این بازار قبلاً ثبت شده است`,
      );
    }
    throw new ConflictException('این مقدار در این بازار از قبل ثبت شده است');
  }

  async create(currentUser: { id: string }, dto: CreateGuarantorDto) {
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

    const idNumber = dto.idNumber?.trim() || undefined;

    try {
      return await this.prisma.guarantor.create({
        data: {
          marketId,
          name: dto.name.trim(),
          contact: dto.contact?.trim() || null,
          idNumber: idNumber ?? null,
          details: dto.details?.trim() || null,
        },
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        await this.handleIdNumberConflict(e, marketId, idNumber);
      }
      throw e;
    }
  }

  async findAll(currentUser: { id: string }, query: GuarantorQueryDto) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }
    const where: any =
      actor.role === 'SUPER_ADMIN' ? {} : { marketId: actor.marketId! };

    if (query.isActive !== undefined) where.isActive = query.isActive;

    const searchWhere = buildSearchWhere(GuarantorsService.SEARCH_FIELDS, query.search);
    if (searchWhere) where.AND = [searchWhere];

    const orderBy = resolveSort(query.sortBy, query.sortOrder, GuarantorsService.SORT_FIELDS, {
      name: 'asc',
    });

    return paginate(this.prisma.guarantor, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
    });
  }

  async findOne(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const guarantor = await this.prisma.guarantor.findUnique({ where: { id } });
    if (!guarantor) throw new NotFoundException('ضامن یافت نشد');
    this.ensureAccess(actor, guarantor.marketId);
    return guarantor;
  }

  async update(currentUser: { id: string }, id: string, dto: UpdateGuarantorDto) {
    const actor = await this.getActor(currentUser);
    const guarantor = await this.prisma.guarantor.findUnique({ where: { id } });
    if (!guarantor) throw new NotFoundException('ضامن یافت نشد');
    this.ensureAccess(actor, guarantor.marketId);

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.contact !== undefined) data.contact = dto.contact?.trim() || null;
    if (dto.idNumber !== undefined) data.idNumber = dto.idNumber?.trim() || null;
    if (dto.details !== undefined) data.details = dto.details?.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      return await this.prisma.guarantor.update({ where: { id }, data });
    } catch (e: any) {
      if (e.code === 'P2002') {
        await this.handleIdNumberConflict(e, guarantor.marketId, dto.idNumber?.trim());
      }
      throw e;
    }
  }

  async remove(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const guarantor = await this.prisma.guarantor.findUnique({ where: { id } });
    if (!guarantor) throw new NotFoundException('ضامن یافت نشد');
    this.ensureAccess(actor, guarantor.marketId);

    const contractsCount = await this.prisma.contract.count({
      where: { guarantorId: id },
    });
    if (contractsCount > 0) {
      throw new ConflictException(
        'این ضامن در یک یا چند قرارداد استفاده شده و قابل حذف نیست؛ در عوض می‌توانید آن را غیرفعال کنید',
      );
    }

    await this.prisma.guarantor.delete({ where: { id } });
    return { message: `ضامن «${guarantor.name}» حذف شد` };
  }
}
