import { Prisma } from '@prisma/client';

export type DueStatus = 'settled' | 'no_due_date' | 'overdue' | 'due_soon' | 'ok';

export const DEFAULT_DUE_SOON_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// «تاریخ تقویمیِ» یک لحظه در وقتِ کابل، به‌صورت نیمه‌شبِ UTC — تا با ستون‌های @db.Date (که
// فقط روز دارند) مستقیم قابل‌مقایسه باشد و نتیجه به تایم‌زونِ سرور بستگی نداشته باشد.
export function kabulDate(instant: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kabul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
  return new Date(`${ymd}T00:00:00.000Z`);
}

export function parseDateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

// سررسیدِ گذشته و «نزدیک به سررسید» ذخیره نمی‌شوند؛ همیشه از dueDate و امروز محاسبه می‌شوند.
// daysLeft: مثبت = چند روز مانده، صفر = امروز، منفی = چند روز از سررسید گذشته.
export function describeDue(
  loan: { status: string; dueDate: Date | null },
  today: Date,
  soonDays: number,
): { dueStatus: DueStatus; daysLeft: number | null } {
  if (loan.status === 'SETTLED') return { dueStatus: 'settled', daysLeft: null };
  if (!loan.dueDate) return { dueStatus: 'no_due_date', daysLeft: null };
  const daysLeft = Math.round((loan.dueDate.getTime() - today.getTime()) / DAY_MS);
  if (daysLeft < 0) return { dueStatus: 'overdue', daysLeft };
  if (daysLeft <= soonDays) return { dueStatus: 'due_soon', daysLeft };
  return { dueStatus: 'ok', daysLeft };
}

// مجموعِ قرضِ بازِ یک دیلر به ارز پایه: باقی‌ماندهٔ هر قرض × نرخِ همان روزِ قرض.
export async function openExposureInBase(
  db: Pick<Prisma.TransactionClient, 'dealerLoan'>,
  dealerId: string,
): Promise<Prisma.Decimal> {
  const loans = await db.dealerLoan.findMany({
    where: { dealerId, status: 'OPEN' },
    select: { remainingAmount: true, exchangeRate: true },
  });
  return loans
    .reduce(
      (sum, l) => (l.exchangeRate ? sum.add(l.remainingAmount.mul(l.exchangeRate)) : sum),
      new Prisma.Decimal(0),
    )
    .toDecimalPlaces(4);
}
