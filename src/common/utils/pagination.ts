export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

interface PaginatableDelegate<T> {
  findMany(args: any): Promise<T[]>;
  count(args: { where?: any }): Promise<number>;
}

interface PaginateOptions {
  where?: any;
  orderBy?: any;
  page?: number;
  limit?: number;
  include?: any;
  select?: any;
}

// موتور مشترک صفحه‌بندی — روی هر Prisma delegate ای که findMany/count دارد کار می‌کند
// (this.prisma.floor، this.prisma.account، بعداً this.prisma.tenant و...).
// هر ماژول فقط where/orderBy مخصوص خودش را می‌سازد و همین تابع را صدا می‌زند.
export async function paginate<T>(
  delegate: PaginatableDelegate<T>,
  { where, orderBy, page = 1, limit = 20, include, select }: PaginateOptions,
): Promise<PaginatedResult<T>> {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const skip = (safePage - 1) * safeLimit;

  const [data, total] = await Promise.all([
    delegate.findMany({
      where,
      orderBy,
      skip,
      take: safeLimit,
      ...(include ? { include } : {}),
      ...(select ? { select } : {}),
    }),
    delegate.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / safeLimit));

  return {
    data,
    meta: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPrevPage: safePage > 1,
    },
  };
}

// sortBy را فقط اگر داخل فهرست سفید ماژول باشد می‌پذیرد؛ وگرنه ترتیب پیش‌فرض همان ماژول
// برمی‌گردد. جلوی probing با فیلدهای ناشناخته/حساس (مثل passwordHash) و خطای Prisma
// روی فیلد غلط را می‌گیرد.
export function resolveSort<TField extends string>(
  sortBy: string | undefined,
  sortOrder: 'asc' | 'desc' | undefined,
  allowedFields: readonly TField[],
  fallback: Record<string, 'asc' | 'desc'>,
): Record<string, 'asc' | 'desc'> {
  if (sortBy && (allowedFields as readonly string[]).includes(sortBy)) {
    return { [sortBy]: sortOrder ?? 'desc' };
  }
  return fallback;
}

// ?search=foo را به یک OR روی فیلدهای متنیِ سفیدلیست‌شدهٔ ماژول تبدیل می‌کند.
// اگر عبارتی نباشد undefined برمی‌گرداند تا merge کردن در where ساده باشد.
export function buildSearchWhere(
  fields: readonly string[],
  search: string | undefined,
): { OR: Record<string, { contains: string; mode: 'insensitive' }>[] } | undefined {
  const term = search?.trim();
  if (!term || fields.length === 0) return undefined;

  return {
    OR: fields.map((field) => ({
      [field]: { contains: term, mode: 'insensitive' as const },
    })),
  };
}
