import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    example: 'احمد رحمانی',
    description: 'نام کامل کاربر',
    minLength: 2,
    maxLength: 100,
  })
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


  @ApiProperty({
    example: 'ahmad123',
    description: 'نام کاربری یکتا',
    minLength: 3,
    maxLength: 30,
  })
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


  @ApiPropertyOptional({
    example: 'ahmad@example.com',
    description: 'ایمیل کاربر (اختیاری)',
  })
  @IsOptional()
  @IsEmail(
    {},
    {
      message: 'ایمیل وارد شده معتبر نیست.',
    },
  )
  email?: string;


  @ApiProperty({
    example: 'StrongPassword123',
    description: 'رمز عبور کاربر',
    minLength: 8,
    maxLength: 100,
  })
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