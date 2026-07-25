import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MarketStatus } from '../../generated/prisma/enums';

export class MarketCountsDto {
  @ApiProperty({ example: 3 })
  floors: number;

  @ApiProperty({ example: 25 })
  shops: number;

  @ApiProperty({ example: 18 })
  contracts: number;

  @ApiProperty({ example: 5 })
  marketEmployees: number;

  @ApiProperty({ example: 12 })
  marketExpenses: number;

  @ApiProperty({ example: 4 })
  accounts: number;

  @ApiProperty({ example: 50 })
  journalEntries: number;

  @ApiProperty({ example: 8 })
  cheques: number;

  @ApiProperty({ example: 10 })
  documents: number;

  @ApiProperty({ example: 20 })
  users: number;

  @ApiProperty({ example: 6 })
  shareholders: number;

  @ApiProperty({ example: 3 })
  approvalRequests: number;

  @ApiProperty({ example: 7 })
  maintenanceRequests: number;

  @ApiProperty({ example: 2 })
  securityDeposits: number;
}

export class MarketResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'Karayeban-e-Markazi' })
  name: string;

  @ApiProperty({ example: 'MKT-001' })
  code: string;

  @ApiPropertyOptional({ example: 'Kabul, Afghanistan' })
  address: string | null;

  @ApiPropertyOptional({ example: '+93700123456' })
  phone: string | null;

  @ApiProperty({ enum: MarketStatus, example: MarketStatus.ACTIVE })
  status: MarketStatus;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000' })
  createdById: string | null;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000' })
  updatedById: string | null;

  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-07-25T14:20:00.000Z' })
  updatedAt: Date;

  @ApiProperty({ example: 1 })
  version: number;

  @ApiPropertyOptional({ type: MarketCountsDto })
  _count?: MarketCountsDto;
}

export class MarketSoftDeleteResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'Karayeban-e-Markazi' })
  name: string;

  @ApiProperty({ example: 'MKT-001' })
  code: string;

  @ApiProperty({ enum: MarketStatus, example: MarketStatus.CLOSED })
  status: MarketStatus;

  @ApiProperty({ example: '2026-07-25T14:20:00.000Z' })
  deletedAt: Date;

  @ApiProperty({ example: '2026-07-25T14:20:00.000Z' })
  updatedAt: Date;

  @ApiProperty({ example: 2 })
  version: number;
}
