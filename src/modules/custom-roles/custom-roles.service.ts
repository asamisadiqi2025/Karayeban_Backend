import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { paginate, resolveSort, buildSearchWhere } from '../../common/utils/pagination';
import { AuditLogService } from '../../common/audit-log/audit-log.service';
import { RequestMeta } from '../../common/audit-log/request-meta.util';
import { CreateCustomRoleDto } from './dto/create-custom-role.dto';
import { UpdateCustomRoleDto } from './dto/update-custom-role.dto';
import { CustomRoleQueryDto } from './dto/custom-role-query.dto';

type Actor = { id: string; role: string; marketId: string | null };

// نقش‌های سفارشی همیشه مالِ یک بازار مشخص‌اند (بر خلاف مثلاً ExpenseCategory که می‌تواند
// سراسری باشد) — یک ADMIN فقط نقش‌های بازار خودش را می‌سازد/می‌بیند/ویرایش می‌کند؛
// SUPER_ADMIN با دادنِ marketId می‌تواند برای هر بازاری بسازد.
@Injectable()
export class CustomRolesService {
  private static readonly SORT_FIELDS = ['name', 'createdAt'] as const;
  private static readonly SEARCH_FIELDS = ['name'] as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  private async getActor(currentUser: { id: string }): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, role: true, marketId: true },
    });
    if (!user) throw new ForbiddenException('کاربر معتبر نیست');
    return user;
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

  private ensureAccess(actor: Actor, roleMarketId: string) {
    if (actor.role === 'SUPER_ADMIN') return;
    if (actor.marketId !== roleMarketId) {
      throw new ForbiddenException('دسترسی به این نقش مجاز نیست');
    }
  }

  private async findOrThrow(id: string) {
    const role = await this.prisma.customRole.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('نقش سفارشی یافت نشد');
    return role;
  }

  async create(currentUser: { id: string }, dto: CreateCustomRoleDto, meta: RequestMeta) {
    const actor = await this.getActor(currentUser);
    const marketId = this.resolveMarketId(actor, dto.marketId);

    try {
      const role = await this.prisma.customRole.create({
        data: {
          marketId,
          name: dto.name.trim(),
          permissions: dto.permissions,
          description: dto.description?.trim() || null,
        },
      });

      await this.auditLog.record({
        action: 'CREATE',
        entityType: 'CustomRole',
        entityId: role.id,
        marketId,
        userId: actor.id,
        newData: role,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return role;
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException(`نقشی با نام «${dto.name}» در این بازار از قبل وجود دارد`);
      }
      throw e;
    }
  }

  async findAll(currentUser: { id: string }, query: CustomRoleQueryDto) {
    const actor = await this.getActor(currentUser);
    const where: any =
      actor.role === 'SUPER_ADMIN'
        ? query.marketId
          ? { marketId: query.marketId }
          : {}
        : { marketId: actor.marketId };

    const searchWhere = buildSearchWhere(CustomRolesService.SEARCH_FIELDS, query.search);
    if (searchWhere) Object.assign(where, searchWhere);

    const orderBy = resolveSort(query.sortBy, query.sortOrder, CustomRolesService.SORT_FIELDS, {
      name: 'asc',
    });

    return paginate(this.prisma.customRole, {
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
    });
  }

  async findOne(currentUser: { id: string }, id: string) {
    const actor = await this.getActor(currentUser);
    const role = await this.findOrThrow(id);
    this.ensureAccess(actor, role.marketId);
    return role;
  }

  async update(
    currentUser: { id: string },
    id: string,
    dto: UpdateCustomRoleDto,
    meta: RequestMeta,
  ) {
    const actor = await this.getActor(currentUser);
    const role = await this.findOrThrow(id);
    this.ensureAccess(actor, role.marketId);

    if (role.isSystem) {
      throw new ConflictException('نقش‌های سیستمی قابل ویرایش نیستند');
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.permissions !== undefined) data.permissions = dto.permissions;
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;

    try {
      const updated = await this.prisma.customRole.update({ where: { id }, data });

      await this.auditLog.record({
        action: 'UPDATE',
        entityType: 'CustomRole',
        entityId: id,
        marketId: role.marketId,
        userId: actor.id,
        oldData: role,
        newData: updated,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return updated;
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException(`نقشی با نام «${dto.name}» در این بازار از قبل وجود دارد`);
      }
      throw e;
    }
  }

  async remove(currentUser: { id: string }, id: string, meta: RequestMeta) {
    const actor = await this.getActor(currentUser);
    const role = await this.findOrThrow(id);
    this.ensureAccess(actor, role.marketId);

    if (role.isSystem) {
      throw new ConflictException('نقش‌های سیستمی قابل حذف نیستند');
    }

    const usersCount = await this.prisma.user.count({ where: { customRoleId: id } });
    if (usersCount > 0) {
      throw new ConflictException(
        'این نقش به کاربر(ان)ی تخصیص داده شده و قابل حذف نیست؛ ابتدا نقش آن‌ها را عوض کنید',
      );
    }

    await this.prisma.customRole.delete({ where: { id } });

    await this.auditLog.record({
      action: 'DELETE',
      entityType: 'CustomRole',
      entityId: id,
      marketId: role.marketId,
      userId: actor.id,
      oldData: role,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return { message: `نقش «${role.name}» حذف شد` };
  }
}
