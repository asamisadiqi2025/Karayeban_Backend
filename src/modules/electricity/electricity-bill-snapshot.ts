import { Prisma } from '@prisma/client';

// اسنپ‌شاتِ «چطور این بل حساب شد» که روی خودِ بل ذخیره می‌شود (ElectricityBill.ratePerUnit /
// consumedUnits / isManualAmount). منطقِ خالص و بدونِ دیتابیس تا جداگانه تست شود.
//
// اصل: فقط چیزی ذخیره می‌شود که واقعاً معلوم است؛ هرجا معلوم نیست null می‌ماند، عددِ حدسی نه.

export type BillSnapshotInput = {
  // بلِ مهاجرت‌شده از دفترِ کاغذی (قبل از راه‌اندازیِ سیستم).
  isOpeningEntry: boolean;
  // کاربر totalAmount را دستی داده (تخفیفِ خاص، توافق، یا بلِ کاغذی) — محاسبهٔ خودکار نبوده.
  totalAmountProvided: boolean;
  // Market.electricityRatePerUnit در لحظهٔ صدور؛ فقط برای بل‌های زنده خوانده می‌شود.
  marketRate: Prisma.Decimal | null;
  previousReading: Prisma.Decimal | null;
  currentReading: Prisma.Decimal | null;
  // کلاینت هر دو قرائت را صراحتاً فرستاده؟ برای بلِ مهاجرتی، previousReading «از کنتور» (که درجهٔ
  // فعلیِ کنتور است، نه درجهٔ آن دورهٔ تاریخی) قابل‌اعتماد نیست و مصرف از آن ساخته نمی‌شود.
  readingsProvidedExplicitly: boolean;
};

export type BillSnapshot = {
  ratePerUnit: Prisma.Decimal | null;
  consumedUnits: Prisma.Decimal | null;
  isManualAmount: boolean;
};

export function buildBillSnapshot(input: BillSnapshotInput): BillSnapshot {
  // بلِ مهاجرتی همیشه مبلغش را کاربر از دفتر کاغذی تایپ کرده است.
  const isManualAmount = input.isOpeningEntry || input.totalAmountProvided;

  // نرخِ بازار فقط برای بل‌های زنده معنی دارد؛ نرخِ تاریخیِ یک بلِ مهاجرتی معلوم نیست.
  const ratePerUnit = input.isOpeningEntry ? null : input.marketRate;

  let consumedUnits: Prisma.Decimal | null = null;
  const trustReadings =
    !input.isOpeningEntry || input.readingsProvidedExplicitly;
  if (trustReadings && input.previousReading && input.currentReading) {
    // کنتورِ تعویض‌شده/برگشته (فعلی < قبلی) مصرفِ منفی می‌دهد؛ مصرفِ معتبر نیست → null.
    if (!input.currentReading.lessThan(input.previousReading)) {
      // ستونِ consumed_units دقتِ ۲ رقمِ اعشار دارد (مثل خودِ قرائت‌ها).
      consumedUnits = input.currentReading
        .sub(input.previousReading)
        .toDecimalPlaces(2);
    }
  }

  return { ratePerUnit, consumedUnits, isManualAmount };
}
