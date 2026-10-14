import { Prisma } from '@prisma/client';

// نرخِ سیستم (جدول ExchangeRate) پایهٔ معادلِ ارز پایهٔ «همهٔ» پرداخت‌های بعدی است. یک خطای
// تایپی (مثلاً ۰٫۰۰۱۴ به‌جای ۰٫۰۱۴) بی‌صدا معادلِ ارز پایهٔ هر تراکنشِ آن روز را ۱۰ برابر غلط می‌کند و
// بعداً نمی‌شود فهمید. نرخِ واقعیِ یک ارز از یک ثبت تا ثبتِ بعدی چند درصد جابه‌جا می‌شود، نه چند برابر.
//
// «جهش» با نسبت سنجیده می‌شود (نه درصدِ تفاضل) تا در هر دو جهت یکسان باشد: نصف‌شدن و دوبرابرشدن
// هر دو ضریب ۲ هستند. ضریبِ ۱٫۲۵ یعنی بیش از ۲۵٪ جابه‌جایی در هر جهت.
export const EXCHANGE_RATE_MAX_STEP_FACTOR = 1.25;

export type RateNeighbor = { rate: Prisma.Decimal; effectiveDate: Date };

export type RateJump = {
  side: 'previous' | 'next';
  neighborRate: Prisma.Decimal;
  neighborDate: Date;
  // همیشه ≥ ۱: نسبتِ بزرگ‌تر به کوچک‌تر
  factor: number;
};

// نرخِ جدید را با نزدیک‌ترین نرخِ «قبل» و «بعد» از همان تاریخ مقایسه می‌کند (بعد هم مهم است: ثبتِ
// عقب‌گردِ یک روزِ میانی). اگر همسایه‌ای نباشد (اولین نرخِ این ارز) چیزی برای مقایسه نیست.
export function findSuspiciousRateJumps(
  newRate: Prisma.Decimal.Value,
  neighbors: { previous?: RateNeighbor | null; next?: RateNeighbor | null },
  maxFactor: number = EXCHANGE_RATE_MAX_STEP_FACTOR,
): RateJump[] {
  const next = new Prisma.Decimal(newRate);
  const jumps: RateJump[] = [];

  for (const side of ['previous', 'next'] as const) {
    const neighbor = neighbors[side];
    if (!neighbor || neighbor.rate.isZero() || next.isZero()) continue;
    const ratio = next.div(neighbor.rate);
    const factor = Math.max(ratio.toNumber(), new Prisma.Decimal(1).div(ratio).toNumber());
    if (factor > maxFactor) {
      jumps.push({ side, neighborRate: neighbor.rate, neighborDate: neighbor.effectiveDate, factor });
    }
  }
  return jumps;
}

export function describeRateJumps(newRate: Prisma.Decimal.Value, jumps: RateJump[]): string {
  const parts = jumps.map((j) => {
    const when = j.neighborDate.toISOString().slice(0, 10);
    const label = j.side === 'previous' ? 'نرخِ قبلی' : 'نرخِ بعدی';
    return `${label} ${j.neighborRate.toString()} (${when}) — ${j.factor.toFixed(1)} برابر فاصله`;
  });
  return (
    `نرخِ جدید (${new Prisma.Decimal(newRate).toString()}) با ${parts.join(' و ')} دارد؛ ` +
    'این معمولاً اشتباهِ تایپی است (مثلاً یک صفرِ کم یا زیاد) و معادلِ ارز پایهٔ همهٔ پرداخت‌های آن روز را غلط می‌کند. ' +
    'اگر مطمئنید نرخ درست است، همین درخواست را با confirmLargeChange=true دوباره بفرستید'
  );
}
