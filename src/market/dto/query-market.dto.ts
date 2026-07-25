import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/pagination/pagination.dto';
import { MarketStatus } from '../../generated/prisma/enums';

export class QueryMarketDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Search by market name or code',
    example: 'Karayeban',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: MarketStatus,
    description: 'Filter by market status',
  })
  @IsOptional()
  @IsEnum(MarketStatus, { message: 'وضعيت نامعتبر است.' })
  status?: MarketStatus;
}
