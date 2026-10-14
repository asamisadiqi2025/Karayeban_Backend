import { IsDateString, IsOptional, IsUUID } from 'class-validator';

// استیتمنتِ کاملِ یک مستأجر (کرایه + برقِ همهٔ قراردادهایش با هم) در یک بازه — دقیقاً مثل
// GET /accounts/:id/statement، فقط طرفِ حساب یک مستأجر است نه یک Account.
//
// from/to «روزِ تقویمی» (به وقتِ کابل) هستند و هر دو سر شاملاند؛ اگر ساعت هم فرستاده شود
// فقط بخشِ تاریخ (۱۰ حرفِ اول) خوانده می‌شود.
export class TenantStatementQueryDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  // اختیاری: فقط یک ارز. اگر مستأجر چند ارز دارد و این نیاید، استیتمنت به تفکیکِ هر ارز
  // (currencies[]) برمی‌گردد — ارزهای مختلف هیچ‌وقت با هم جمع نمی‌شوند.
  @IsOptional()
  @IsUUID()
  currencyId?: string;
}
