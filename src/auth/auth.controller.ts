import { Body, Controller, Post } from '@nestjs/common';

import { AuthService } from './auth.service';

import { RegisterDto } from './dto/register.dto';

import { LoginDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

@Public()
@Post('register')
register(@Body() dto:RegisterDto)
{
  return this.authService.register(dto);
}
@Public()
@Post('login')
login(
 @Body() dto: LoginDto
){
 return this.authService.login(dto);
}

  // نیاز به توکن دارد؛ اطلاعات کاربر فعلی را برمی‌گرداند
  // @Get('me')
  // me(@CurrentUser() user: AuthUser) {
  //   return user;
  // }
}
