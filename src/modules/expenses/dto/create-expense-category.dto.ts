import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateExpenseCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  // خالی = دسته‌بندی سراسری، برای همهٔ بازارها قابل‌استفاده (مثل InventoryCategory).
  // فقط SUPER_ADMIN می‌تواند یکی صریح بفرستد؛ نقش‌های دیگر همیشه دسته‌بندیِ مخصوص
  // بازار خودشان را می‌سازند. اگر parentId داده شود، marketId نادیده گرفته می‌شود —
  // سب‌کتگوری همیشه بازارِ والدش را به ارث می‌برد (سرویس این را خودش تعیین می‌کند).
  @IsOptional()
  @IsUUID()
  marketId?: string;

  // اگر داده شود، این یک سب‌کتگوری است (مثلاً «نذیراحمد» زیرِ «معاشات»). والد باید خودش
  // یک کتگوریِ مادر باشد (سطحِ سوم مجاز نیست) — سرویس این را چک می‌کند.
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
