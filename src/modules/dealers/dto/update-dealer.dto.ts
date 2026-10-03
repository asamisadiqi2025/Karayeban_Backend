import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { DealerType } from '@prisma/client';

export class UpdateDealerDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fatherName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  grandfatherName?: string;

  @IsOptional()
  @IsEnum(DealerType)
  type?: DealerType;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  idNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contact?: string;

  @IsOptional()
  @IsString()
  details?: string;

  // undefined = دست‌نخورده؛ عدد = سقفِ جدید (به ارز پایه)؛ null = برداشتنِ سقف. فقط ادمین.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  creditLimit?: number | null;

  // غیرفعال‌شده قرضِ تازه نمی‌گیرد، ولی همچنان می‌تواند بدهی‌اش را برگرداند.
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isActive?: boolean;
}
