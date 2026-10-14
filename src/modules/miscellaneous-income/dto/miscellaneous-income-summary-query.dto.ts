import { IsDateString, IsOptional, IsUUID } from 'class-validator';

// خلاصهٔ «تاحال/در این بازه چقدر عایدی از این کتگوری داشته‌ایم» — اگر categoryId یک کتگوریِ
// مادر باشد، خودکار مجموعِ همهٔ سب‌کتگوری‌هایش هم حساب می‌شود.
export class MiscellaneousIncomeSummaryQueryDto {
  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}
