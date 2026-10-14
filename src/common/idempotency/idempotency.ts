import { createHash } from 'crypto';
import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { acquireAdvisoryXactLock } from '../utils/advisory-lock';

// جلوگیری از «ثبتِ دوبارهٔ یک پرداخت» (دابل‌کلیک، تلاشِ دوباره بعد از قطعیِ شبکه) با هدر
// Idempotency-Key. فرانت برای هر «ارسالِ فرم» یک کلیدِ تازه (مثلاً uuid) می‌سازد و در همهٔ تلاش‌های
// همان ارسال همان را می‌فرستد.
//
// طراحی (اتمیک، بدونِ وضعیتِ «در حال انجام»):
//  ۱) یک قفلِ مشورتیِ اختصاصیِ (کاربر، عملیات، کلید) گرفته می‌شود → درخواست‌های هم‌زمانِ همان کلید
//     پشتِ هم می‌روند.
//  ۲) اگر کلید قبلاً ثبت شده بود: همان پاسخِ قبلی برمی‌گردد (کارِ دوم انجام نمی‌شود)؛ مگر بدنهٔ درخواست
//     فرق کند که خطای ۴۲۲ است.
//  ۳) وگرنه کار انجام می‌شود و ردیفِ کلید «در همان تراکنش» ساخته می‌شود؛ پس پرداخت و کلید یا هر دو
//     commit می‌شوند یا هیچ‌کدام. اگر کار خطا بدهد، کلیدی ذخیره نمی‌شود و تلاشِ دوباره آزاد است.
// بدونِ هدر، دقیقاً همان رفتارِ قبلی (یک تراکنشِ ساده) است.

export const IDEMPOTENCY_TTL_MS = 48 * 60 * 60 * 1000;
export const IDEMPOTENCY_HEADER = 'idempotency-key';

const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,100}$/;

// مقدارِ خامِ هدر → کلیدِ معتبر یا undefined (نیامده/خالی). نامعتبر = ۴۰۰.
export function parseIdempotencyKey(
  raw: string | string[] | undefined,
): string | undefined {
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) {
    throw new BadRequestException(
      'هدر Idempotency-Key فقط یک‌بار باید ارسال شود',
    );
  }
  const key = raw.trim();
  if (key === '') return undefined;
  if (!KEY_PATTERN.test(key)) {
    throw new BadRequestException(
      'Idempotency-Key نامعتبر است (۸ تا ۱۰۰ نویسه از حروفِ انگلیسی، عدد و . _ : -)',
    );
  }
  return key;
}

// کلیدِ هر آیتم در درخواستِ bulk: «<کلید>#<شمارهٔ آیتم>» — تا تلاشِ دوبارهٔ کلِ درخواست، فقط آیتم‌هایی
// را که هنوز انجام نشده‌اند انجام دهد و بقیه را از ثبتِ قبلی بازپخش کند.
export function itemIdempotencyKey(
  key: string | undefined,
  index: number,
): string | undefined {
  return key === undefined ? undefined : `${key}#${index}`;
}

// JSON با ترتیبِ ثابتِ کلیدها (و بدونِ undefined) — تا دو بدنهٔ هم‌معنی همیشه یک هش بدهند.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonicalize(v)]),
    );
  }
  return value;
}

export function hashRequest(payload: unknown): string {
  // برگشت از JSON: Date/Decimal را به همان شکلِ متنی می‌برد و undefined را حذف می‌کند.
  const normalized = canonicalize(JSON.parse(JSON.stringify(payload ?? null)));
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export type IdempotentRun<T> = {
  userId: string;
  scope: string;
  key: string | undefined;
  requestHash: string;
  work: (tx: Prisma.TransactionClient) => Promise<T>;
};

export async function runIdempotent<T>(
  prisma: PrismaService,
  opts: IdempotentRun<T>,
): Promise<T> {
  const { userId, scope, key, requestHash, work } = opts;
  // بدونِ کلید: دقیقاً همان رفتارِ قبلی.
  if (key === undefined) return prisma.$transaction(work);

  return prisma.$transaction(async (tx) => {
    await acquireAdvisoryXactLock(tx, `idem:${userId}:${scope}:${key}`);

    const existing = await tx.idempotencyKey.findUnique({
      where: { userId_scope_key: { userId, scope, key } },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new UnprocessableEntityException(
          'این Idempotency-Key قبلاً با یک درخواستِ دیگر استفاده شده است؛ برای هر ارسالِ تازه یک کلیدِ تازه بفرستید',
        );
      }
      // بازپخشِ همان پاسخِ قبلی (JSON؛ Decimal/Date همان شکلِ متنیِ پاسخِ اصلی را دارند).
      return existing.response as unknown as T;
    }

    const result = await work(tx);
    await tx.idempotencyKey.create({
      data: {
        userId,
        scope,
        key,
        requestHash,
        response: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      },
    });
    return result;
  });
}
