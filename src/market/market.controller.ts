import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe, Req } from '@nestjs/common';
import { MarketService } from './market.service';
import { CreateMarketDto } from './dto/create-market.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/jwt-payload.type';
import type { Request } from 'express';

@Controller('market')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Post()
  create(@Body() createMarketDto: CreateMarketDto, @CurrentUser() user: AuthUser) {
    return this.marketService.create(createMarketDto, user.id);
  }

  @Get()
  findAll() {
    return this.marketService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.marketService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    console.log('[PATCH] req.body:', JSON.stringify(req.body));
    return this.marketService.update(id, (req.body ?? {}) as Record<string, unknown>, user.id);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.marketService.remove(id, user.id);
  }
}
