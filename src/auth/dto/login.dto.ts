import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  Length,
} from 'class-validator';

export class LoginDto {
   @ApiProperty({
    example: 'ahmad123',
    description: 'نام کاربری',
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


    @ApiProperty({
    example: 'StrongPassword123',
    description: 'رمز عبور',
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