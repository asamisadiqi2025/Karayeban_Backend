import { DealerType } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateDealerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fullName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fatherName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  grandfatherName?: string;

  // پیش‌فرض EMPLOYEE.
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

  // سقفِ مجموعِ قرضِ باز به «ارز پایهٔ مارکت». فقط ادمین می‌تواند بفرستد؛ نفرستید = بدونِ سقف.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  creditLimit?: number;

  // فقط برای SUPER_ADMIN: ثبت دیلر زیر یک بازار مشخص.
  @IsOptional()
  @IsUUID()
  marketId?: string;
}
