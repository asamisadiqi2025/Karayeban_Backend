import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterSuperAdminDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsString()
  @MinLength(8)
  @MaxLength(30)
  @Matches(/^[a-z0-9_.]+$/, {
    message:
      'username can only contain lowercase letters, numbers, "_" and "."',
  })
  @Matches(/(?=.*[a-z])(?=.*\d)/, {
    message: 'username must contain at least one letter and one number',
  })
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'password must contain at least one letter and one number',
  })
  password: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsString()
  secret: string;
}
