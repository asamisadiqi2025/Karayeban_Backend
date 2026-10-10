import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { acquireAdvisoryXactLock } from './advisory-lock';

// شمارهٔ رسید: فاصله‌های اول/آخر حذف می‌شود و رشتهٔ خالی «بدون رسید» (null) حساب می‌شود.
export function normalizeReceiptNumber(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export type ReceiptKind = 'rent' | 'electricity';

const KIND_LABEL: Record<ReceiptKind, string> = {
  rent: 'کرایه',
  electricity: 'برق',
};

// یک شمارهٔ رسید فقط یک‌بار برای «پرداخت‌های زندهٔ هر نوع» (کرایه | برق) در هر بازار استفاده می‌شود.
//  - مقایسه بدونِ حساسیت به حروفِ بزرگ/کوچک ('r-1' با 'R-1' یکی است).
//  - به‌ازای هر «نوع» جدا بررسی می‌شود: پرداختِ ترکیبیِ کرایه+برق (ContractsService.payDebt) عمداً یک
//    رسید را برای هر دو جدول می‌گذارد و باید مجاز بماند.
//  - پرداخت‌های مهاجرتی (isOpeningEntry) از این قاعده معافند (یک رسیدِ کاغذیِ قدیمی ممکن است چند
//    بل را بپوشاند)، اما پرداختِ زنده با رسیدِ یک پرداختِ مهاجرتی هم تکراری حساب می‌شود.
//  - بدونِ ایندکسِ یکتا در دیتابیس (تا مهاجرتِ دیتابیس به دادهٔ قدیمیِ احتمالاً تکراری وابسته نباشد)
//    و برای جلوگیری از رقابتِ هم‌زمان، بررسی زیرِ یک قفلِ مشورتیِ اختصاصیِ همین (بازار، نوع، رسید) انجام
//    می‌شود: دو درخواستِ هم‌زمان با یک رسید پشتِ هم می‌روند و دومی خطای ۴۰۹ می‌گیرد.
export async function assertReceiptNumberFree(
  tx: Prisma.TransactionClient,
  params: { kind: ReceiptKind; marketId: string; receiptNumber: string },
): Promise<void> {
  const { kind, marketId, receiptNumber } = params;
  await acquireAdvisoryXactLock(
    tx,
    `receipt:${kind}:${marketId}:${receiptNumber.toLowerCase()}`,
  );

  const where = {
    marketId,
    receiptNumber: { equals: receiptNumber, mode: 'insensitive' as const },
  };
  const existing =
    kind === 'rent'
      ? await tx.rentPayment.findFirst({ where, select: { id: true } })
      : await tx.electricityPayment.findFirst({ where, select: { id: true } });

  if (existing) {
    throw new ConflictException(
      `شمارهٔ رسید «${receiptNumber}» قبلاً برای یک پرداخت ${KIND_LABEL[kind]} ثبت شده است`,
    );
  }
}
