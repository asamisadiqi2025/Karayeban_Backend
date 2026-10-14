import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateMiscellaneousIncomeCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  // فقط برای SUPER_ADMIN (که به هیچ مارکتی وصل نیست) الزامی است؛ برای نقش‌های دیگر نادیده گرفته
  // می‌شود و دسته‌بندی همیشه برای بازارِ کاربر جاری ساخته می‌شود. برخلاف مصارف، دسته‌بندیِ
  // سراسری وجود ندارد — هر دسته‌بندی مخصوصِ یک مارکت است. اگر parentId داده شود هم، marketId
  // نادیده گرفته می‌شود (سب‌کتگوری همیشه بازارِ والدش را می‌گیرد).
  @IsOptional()
  @IsUUID()
  marketId?: string;

  // اگر داده شود، این یک سب‌کتگوری است (مثلاً «تابلوی شماره ۱۲» زیرِ «اجاره تابلو»). والد باید خودش
  // یک کتگوریِ مادر باشد (سطحِ سوم مجاز نیست) — سرویس این را چک می‌کند.
  @IsOptional()
  @IsUUID()
  parentId?: string;

  // نام سب‌کتگوری‌هایی که هم‌زمان با ساختِ همین کتگوریِ مادر ساخته می‌شوند (همه یا هیچ).
  // همراه با parentId معتبر نیست — سب‌کتگوری نمی‌تواند خودش زیرشاخه داشته باشد.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  subcategories?: string[];
}
