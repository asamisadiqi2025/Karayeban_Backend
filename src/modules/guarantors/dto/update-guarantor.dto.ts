import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateGuarantorDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  idNumber?: string;

  @IsOptional()
  @IsString()
  details?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
