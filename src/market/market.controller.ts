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
  UseGuards,
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
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';


@ApiTags('Markets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('markets')
export class MarketController {

  constructor(
    private readonly marketService: MarketService,
  ) {}


  @Get()
  @ApiOperation({
    summary: 'Get all markets',
  })
  @ApiOkResponse({
    description: 'Paginated markets list',
    type: MarketResponseDto,
  })
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryMarketDto,
  ) {
    return this.marketService.findAll(
      user,
      query,
    );
  }



  @Get(':id')
  @ApiOperation({
    summary: 'Get market by ID',
  })
  @ApiOkResponse({
    description: 'Single market details',
    type: MarketResponseDto,
  })
  async findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {

    return this.marketService.findOne(
      user,
      id,
    );
  }



  @Post()
  @ApiOperation({
    summary: 'Create market',
  })
  @ApiOkResponse({
    description: 'Created market',
    type: MarketResponseDto,
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateMarketDto,
  ) {

    return this.marketService.create(
      dto,
      user.id,
    );
  }



  @Patch(':id')
  @ApiOperation({
    summary: 'Update market',
  })
  @ApiOkResponse({
    description: 'Updated market',
    type: MarketResponseDto,
  })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMarketDto,
  ) {

    return this.marketService.update(
      user,
      id,
      dto,
    );
  }



  @Delete(':id')
  @ApiOperation({
    summary: 'Soft delete market',
  })
  @ApiOkResponse({
    description: 'Deleted market',
    type: MarketSoftDeleteResponseDto,
  })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {

    return this.marketService.remove(
      user,
      id,
    );
  }
}