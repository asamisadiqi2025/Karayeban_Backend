import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateFloorDto {
  @IsOptional()
  @IsInt()
  floorNumber?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  details?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
