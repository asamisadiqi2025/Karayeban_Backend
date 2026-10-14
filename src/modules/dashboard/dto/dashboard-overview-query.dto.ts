import { IsIn, IsOptional, IsUUID } from 'class-validator';

export const DASHBOARD_PERIODS = ['month', 'year'] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

// marketId فقط برای SUPER_ADMIN لازم است (بقیهٔ نقش‌ها همیشه بازارِ خودشان را می‌بینند).
// period بازهٔ ویجت‌های «خلاصهٔ مصارف» و «آخرین مصارف» را تعیین می‌کند: برجِ جاری (پیش‌فرض) یا سالِ جاری.
export class DashboardOverviewQueryDto {
  @IsOptional()
  @IsUUID()
  marketId?: string;

  @IsOptional()
  @IsIn(DASHBOARD_PERIODS)
  period?: DashboardPeriod;
}
