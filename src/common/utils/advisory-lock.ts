import { Prisma } from '@prisma/client';

// قفلِ مشورتیِ سطحِ تراکنشِ PostgreSQL روی یک «کلیدِ متنی» — تا پایانِ همین تراکنش (commit/rollback)
// نگه داشته می‌شود و خودکار آزاد می‌شود. دو تراکنشِ هم‌زمان با «همان کلید» پشتِ هم صف می‌شوند و
// دومی بعد از commitِ اولی ادامه می‌دهد (و نتیجهٔ اولی را می‌بیند). روی هیچ ردیف/جدولی قفل
// نمی‌گذارد، پس با بقیهٔ عملیات تداخلی ندارد.
//
// کلید باید «اختصاصیِ همان کار» باشد (مثلاً idem:<user>:<scope>:<key>) تا فقط درخواست‌هایی که واقعاً
// باید پشتِ هم بروند صف شوند. hashtextextended خروجیِ bigint می‌دهد (ورودیِ pg_advisory_xact_lock).
export async function acquireAdvisoryXactLock(
  tx: Prisma.TransactionClient,
  key: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
