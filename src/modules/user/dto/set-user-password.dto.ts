import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SetUserPasswordDto {
  // همان قاعدهٔ ساختِ کاربر. ادمین فقط رمزِ جدید را می‌گذارد؛ رمزِ فعلیِ هیچ کاربری هرگز دیده
  // نمی‌شود (در دیتابیس فقط هش است).
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'password must contain at least one letter and one number',
  })
  newPassword: string;
}
