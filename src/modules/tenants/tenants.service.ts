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
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantQueryDto } from './dto/tenant-query.dto';

type Actor = { id: string; role: string; marketId: string | null };

@Injectable()
export class TenantsService {
  private static readonly SORT_FIELDS = ['fullName', 'createdAt'] as const;
  private static readonly SEARCH_FIELDS = [
    'fullName',
    'fatherName',
    'grandfatherName',
    'idNumber',
    'contact',
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

  private ensureAccess(actor: Actor, tenantMarketId: string) {
    if (actor.role === 'SUPER_ADMIN') return;
    if (actor.marketId !== tenantMarketId) {
      throw new ForbiddenException('دسترسی به این مستأجر مجاز نیست');
    }
  }

  // همان درسی که برای Guarantor گرفتیم: به‌جای پیام مبهم، خودِ مستأجرِ از‌قبل‌ثبت‌شده
  // را معرفی می‌کنیم. با @prisma/adapter-pg فیلدهای قید نقض‌شده زیر driverAdapterError
  // می‌آیند، نه target کلاسیک — هر دو شکل را چک می‌کنیم.
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
      const existing = await this.prisma.tenant.findFirst({
        where: { marketId, idNumber },
        select: { id: true, fullName: true },
      });
      throw new ConflictException(
        existing
          ? `مستأجری با شمارهٔ تذکرهٔ «${idNumber}» قبلاً با نام «${existing.fullName}» ثبت شده (شناسه: ${existing.id}) — به‌جای ساختن رکورد جدید، از همان مستأجر استفاده کنید`
          : `شمارهٔ تذکرهٔ «${idNumber}» در این بازار قبلاً ثبت شده است`,
      );
    }
    throw new ConflictException('این مقدار در این بازار از قبل ثبت شده است');
  }

  async create(currentUser: { id: string }, dto: CreateTenantDto) {
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
      return await this.prisma.tenant.create({
        data: {
          marketId,
          fullName: dto.fullName.trim(),
          fatherName: dto.fatherName?.trim() || null,
          grandfatherName: dto.grandfatherName?.trim() || null,
          idNumber: idNumber ?? null,
          contact: dto.contact?.trim() || null,
          gender: dto.gender,
          details: dto.details?.trim() || null,
          photo: dto.photo?.trim() || null,
        },
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        await this.handleIdNumberConflict(e, marketId, idNumber);
      }
      throw e;
    }
  }

  async findAll(currentUser: { id: string }, query: TenantQueryDto) {
    const actor = await this.getActor(currentUser);
    if (actor.role !== 'SUPER_ADMIN' && !actor.marketId) {
      throw new ForbiddenException('کاربر جاری به هیچ بازاری متصل نیست');
    }
    const where: any =
      actor.role === 'SUPER_ADMIN' ? {} : { marketId: actor.marketId! };

    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.gender !== undefined) where.gender = query.gender;

    const searchWhere = buildSearchWhere(TenantsService.SEARCH_FIELDS, query.search);
    if (searchWhere) where.AND = [searchWhere];

    const orderBy = resolveSort(query.sortBy, query.sortOrder, TenantsService.SORT_FIELDS, {
      fullName: 'asc',
    });

    return paginate(this.prisma.tenant, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
    });
  }

  async findOne(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('مستأجر یافت نشد');
    this.ensureAccess(actor, tenant.marketId);
    return tenant;
  }

  async update(currentUser: { id: string }, id: string, dto: UpdateTenantDto) {
    const actor = await this.getActor(currentUser);
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('مستأجر یافت نشد');
    this.ensureAccess(actor, tenant.marketId);

    const data: Record<string, unknown> = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName.trim();
    if (dto.fatherName !== undefined) data.fatherName = dto.fatherName?.trim() || null;
    if (dto.grandfatherName !== undefined)
      data.grandfatherName = dto.grandfatherName?.trim() || null;
    if (dto.idNumber !== undefined) data.idNumber = dto.idNumber?.trim() || null;
    if (dto.contact !== undefined) data.contact = dto.contact?.trim() || null;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.details !== undefined) data.details = dto.details?.trim() || null;
    if (dto.photo !== undefined) data.photo = dto.photo?.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      return await this.prisma.tenant.update({ where: { id }, data });
    } catch (e: any) {
      if (e.code === 'P2002') {
        await this.handleIdNumberConflict(e, tenant.marketId, dto.idNumber?.trim());
      }
      throw e;
    }
  }

  async remove(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('مستأجر یافت نشد');
    this.ensureAccess(actor, tenant.marketId);

    const [
      contractsCount,
      rentChargesCount,
      rentPaymentsCount,
      currentShopsCount,
      electricityBillsCount,
      electricityPaymentsCount,
      collateralItemsCount,
    ] = await Promise.all([
      this.prisma.contract.count({ where: { tenantId: id } }),
      this.prisma.rentCharges.count({ where: { tenantId: id } }),
      this.prisma.rentPayment.count({ where: { tenantId: id } }),
      this.prisma.shop.count({ where: { currentTenantId: id } }),
      this.prisma.electricityBill.count({ where: { tenantId: id } }),
      this.prisma.electricityPayment.count({ where: { tenantId: id } }),
      this.prisma.collateralItem.count({ where: { tenantId: id } }),
    ]);

    const hasRelations =
      contractsCount > 0 ||
      rentChargesCount > 0 ||
      rentPaymentsCount > 0 ||
      currentShopsCount > 0 ||
      electricityBillsCount > 0 ||
      electricityPaymentsCount > 0 ||
      collateralItemsCount > 0;

    if (hasRelations) {
      throw new ConflictException(
        'این مستأجر دارای قرارداد یا سابقهٔ تراکنش است و قابل حذف نیست؛ در عوض می‌توانید آن را غیرفعال کنید',
      );
    }

    await this.prisma.tenant.delete({ where: { id } });
    return { message: `مستأجر «${tenant.fullName}» حذف شد` };
  }
}
