import { IsDateString, IsOptional, IsUUID } from 'class-validator';

// خلاصهٔ همهٔ کتگوری‌ها یک‌جا برای یک بازه — برخلاف ExpenseSummaryQueryDto که فقط یک
// کتگوری (به‌همراه زیرشاخه‌هایش) را می‌گیرد، این هر کتگوریِ مادر را با مجموعِ خودش +
// همهٔ زیرشاخه‌هایش برمی‌گرداند؛ برای نمودارِ «مصرف در این ماه به تفکیکِ همهٔ دسته‌ها».
export class ExpenseBreakdownQueryDto {
  @IsOptional()
  @IsUUID()
  marketId?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}
