import { IsDateString } from 'class-validator';

// استیتمنتِ کاملِ یک مستأجر (کرایه + برقِ همهٔ قراردادهایش با هم) در یک بازه — دقیقاً مثل
// GET /accounts/:id/statement، فقط طرفِ حساب یک مستأجر است نه یک Account.
export class TenantStatementQueryDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}
