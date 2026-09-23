import { IsDateString, IsOptional, IsUUID } from 'class-validator';

// جمعِ هزینهٔ استهلاکِ شناسایی‌شده در یک بازه — بر اساسِ appliedAt (لحظهٔ واقعی‌ای که
// رویداد ثبت شده)، نه فیلدِ year روی DepreciationEvent که فقط شمارندهٔ «سالِ چندمِ عمرِ
// همین دارایی» است، نه سالِ تقویمی.
export class AssetDepreciationSummaryQueryDto {
  @IsOptional()
  @IsUUID()
  marketId?: string;

  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}
