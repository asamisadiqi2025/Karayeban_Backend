import {
  IsNotEmpty,
  IsString,
  Length,
} from 'class-validator';

export class LoginDto {
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