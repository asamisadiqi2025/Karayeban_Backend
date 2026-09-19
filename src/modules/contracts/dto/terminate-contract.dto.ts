import { IsDateString, IsOptional, IsString } from 'class-validator';

export class TerminateContractDto {
  @IsDateString()
  terminationDate: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
