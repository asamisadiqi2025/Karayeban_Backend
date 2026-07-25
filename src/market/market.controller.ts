import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/jwt-payload.type';
import { MarketService } from './market.service';
import { CreateMarketDto } from './dto/create-market.dto';
import { UpdateMarketDto } from './dto/update-market.dto';
import { QueryMarketDto } from './dto/query-market.dto';
import {
  MarketResponseDto,
  MarketSoftDeleteResponseDto,
} from './dto/market-response.dto';

@ApiTags('Markets')
@ApiBearerAuth()
@Controller('markets')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get()
  @ApiOperation({ summary: 'List markets' })
  @ApiOkResponse({ description: 'List of markets with pagination', type: MarketResponseDto, isArray: true })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryMarketDto,
  ) {
    return this.marketService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get market by ID' })
  @ApiOkResponse({ description: 'Market details', type: MarketResponseDto })
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.marketService.findOne(user, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new market' })
  @ApiOkResponse({ description: 'Created market', type: MarketResponseDto })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateMarketDto,
  ) {
    return this.marketService.create(dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update market' })
  @ApiOkResponse({ description: 'Updated market', type: MarketResponseDto })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMarketDto,
  ) {
    return this.marketService.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete market' })
  @ApiOkResponse({ description: 'Soft-deleted market', type: MarketSoftDeleteResponseDto })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.marketService.remove(user, id);
  }
}
