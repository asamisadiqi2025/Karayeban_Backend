import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterSuperAdminDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsString()
  secret: string;
}
