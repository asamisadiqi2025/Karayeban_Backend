import { IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  refreshToken: string;
}
// ❌ کلاس دوم RefreshTokenDto را حذف کنید