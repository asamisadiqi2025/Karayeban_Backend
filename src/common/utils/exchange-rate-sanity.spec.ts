import { Prisma } from '@prisma/client';
import {
  describeRateJumps,
  EXCHANGE_RATE_MAX_STEP_FACTOR,
  findSuspiciousRateJumps,
} from './exchange-rate-sanity';

const D = (v: number | string) => new Prisma.Decimal(v);
const d = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const n = (rate: number | string, ymd: string) => ({ rate: D(rate), effectiveDate: d(ymd) });

// عددهای واقعیِ دیتابیس: ۱ AFN = X ارز پایه
const PREV = n('0.013', '2026-09-29');
const NEXT = n('0.014', '2026-10-02');

describe('findSuspiciousRateJumps — خطای تایپیِ نرخ', () => {
  it('همان اشتباهِ واقعی (۰٫۰۰۱۴ به‌جای ۰٫۰۱۴) با هر دو همسایه پرچم می‌خورد', () => {
    const jumps = findSuspiciousRateJumps('0.0014', { previous: PREV, next: NEXT });
    expect(jumps.map((j) => j.side)).toEqual(['previous', 'next']);
    expect(jumps[0].factor).toBeCloseTo(9.29, 1);
    expect(jumps[1].factor).toBeCloseTo(10, 5);
  });

  it('اصلاحِ همان خطا (۰٫۰۱۴) نسبت به همسایه‌ها عادی است', () => {
    expect(findSuspiciousRateJumps('0.014', { previous: PREV, next: NEXT })).toEqual([]);
  });

  it('نوسانِ معمولیِ روزانه (۰٫۰۱۳ → ۰٫۰۱۳۵) پرچم نمی‌خورد', () => {
    expect(findSuspiciousRateJumps('0.0135', { previous: PREV })).toEqual([]);
  });

  it('اولین نرخِ یک ارز (بدونِ همسایه) هر مقداری باشد پرچم نمی‌خورد', () => {
    expect(findSuspiciousRateJumps('999', {})).toEqual([]);
    expect(findSuspiciousRateJumps('0.0000001', { previous: null, next: null })).toEqual([]);
  });

  it('متقارن است: ۱۰ برابر شدن و ۱۰ برابر کم‌شدن هر دو جهش‌اند', () => {
    expect(findSuspiciousRateJumps('0.13', { previous: PREV })).toHaveLength(1);
    expect(findSuspiciousRateJumps('0.0013', { previous: PREV })).toHaveLength(1);
  });

  it('مرزِ ضریبِ ۱٫۲۵: دقیقاً روی مرز مجاز، فراتر از آن جهش', () => {
    expect(EXCHANGE_RATE_MAX_STEP_FACTOR).toBe(1.25);
    const one = { previous: n(1, '2026-01-01') };
    expect(findSuspiciousRateJumps('1.25', one)).toEqual([]); // ×۱٫۲۵
    expect(findSuspiciousRateJumps('0.8', one)).toEqual([]); // ÷۱٫۲۵
    expect(findSuspiciousRateJumps('1.26', one)).toHaveLength(1);
    expect(findSuspiciousRateJumps('0.79', one)).toHaveLength(1);
  });

  it('پیامِ خطا اعدادِ دقیق و راهِ تأیید را می‌گوید', () => {
    const jumps = findSuspiciousRateJumps('0.0014', { previous: PREV });
    const msg = describeRateJumps('0.0014', jumps);
    expect(msg).toContain('0.0014');
    expect(msg).toContain('0.013');
    expect(msg).toContain('2026-09-29');
    expect(msg).toContain('confirmLargeChange=true');
  });
});
