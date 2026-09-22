import { IsDateString, IsOptional, IsUUID } from 'class-validator';

// خلاصهٔ «تاحال/در این بازه چقدر بابت این کتگوری داده‌ایم» — اگر categoryId یک کتگوریِ
// مادر باشد (مثلاً «تیل»)، خودکار مجموعِ همهٔ سب‌کتگوری‌هایش هم حساب می‌شود (مثلاً
// «تیل جنراتور» + «تیل موتر»)، نه فقط چیزی که مستقیم به خودِ «تیل» بسته شده.
export class ExpenseSummaryQueryDto {
  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}
