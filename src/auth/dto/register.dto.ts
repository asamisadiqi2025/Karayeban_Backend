import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class RegisterDto {
  @IsNotEmpty({
    message: 'نام الزامی است.',
  })
  @IsString({
    message: 'نام باید متن باشد.',
  })
  @Length(2, 100, {
    message: 'نام باید بین ۲ تا ۱۰۰ کاراکتر باشد.',
  })
  name: string;

  @IsNotEmpty({
    message: 'نام کاربری الزامی است.',
  })
  @IsString({
    message: 'نام کاربری باید متن باشد.',
  })
  @Length(3, 30, {
    message: 'نام کاربری باید بین ۳ تا ۳۰ کاراکتر باشد.',
  })
  username: string;

  @IsOptional()
  @IsEmail(
    {},
    {
      message: 'ایمیل وارد شده معتبر نیست.',
    },
  )
  email?: string;

  @IsNotEmpty({
    message: 'رمز عبور الزامی است.',
  })
  @IsString({
    message: 'رمز عبور باید متن باشد.',
  })
  @Length(8, 100, {
    message: 'رمز عبور باید حداقل ۸ کاراکتر باشد.',
  })
  password: string;
}
