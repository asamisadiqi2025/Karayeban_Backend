import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  // توکنِ داخلِ لینکِ ایمیل.
  @IsString()
  @MaxLength(200)
  token: string;

  // همان قاعدهٔ ساختِ کاربر: حداقل ۸ کاراکتر، شاملِ حرف و عدد (حداکثر ۷۲ چون bcrypt بیشتر را نمی‌خواند).
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'password must contain at least one letter and one number',
  })
  newPassword: string;
}
