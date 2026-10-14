import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// DELETE بدنه ندارد؛ دلیل به‌صورت query می‌آید (?reason=...). حذفِ یک عایدی موجودیِ حساب را کم
// می‌کند و ردیفِ دفترکل را پاک می‌کند، پس دلیل اجباری و در audit trail ثبت می‌شود.
export class RemoveMiscellaneousIncomeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
