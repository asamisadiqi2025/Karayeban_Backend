import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

// دو حالت:
//  - بدونِ rootCategoryId: هر کتگوریِ مادر با مجموعِ خودش + زیرشاخه‌هایش (تعدادِ مادرها کم است، پس
//    بدونِ صفحه‌بندی)؛ برای نمودار «عایدی این ماه به تفکیکِ دسته‌ها».
//  - با rootCategoryId: سب‌کتگوری‌های همان مادر با مجموعِ هرکدام، صفحه‌بندی‌شده و قابلِ جست‌وجو —
//    تا حتی با هزاران سب‌کتگوری حجمِ پاسخ و کارِ دیتابیس ثابت بماند (drill-down).
export class MiscellaneousIncomeBreakdownQueryDto {
  @IsOptional()
  @IsUUID()
  marketId?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsUUID()
  rootCategoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;
}
