import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateContractDto {
  @IsOptional()
  @IsUUID()
  guarantorId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
