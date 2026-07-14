import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {

  @IsString()
 @IsNotEmpty({ message: 'نام کاربری الزامی است' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: 'رمز عبور الزامی است' })
  @MinLength(6, { message: 'رمز عبور حداقل ۶ کاراکتر باشد' })
  password: string;

}