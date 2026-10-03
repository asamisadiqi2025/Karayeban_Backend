import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';

// کلیدِ دسترسیِ لازم برای این route (مثلاً 'rent.pay'). کلید باید در permissions.catalog.ts
// تعریف شده باشد، وگرنه سرور هنگام بالا آمدن خطا می‌دهد.
export const Permission = (key: string) => SetMetadata(PERMISSION_KEY, key);
