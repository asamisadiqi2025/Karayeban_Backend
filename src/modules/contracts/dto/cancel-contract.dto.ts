import { IsOptional, IsString } from 'class-validator';

export class CancelContractDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
