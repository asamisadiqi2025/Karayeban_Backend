import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateShareholderDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  idNumber?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
