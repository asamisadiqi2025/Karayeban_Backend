import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { MarketBackupsService } from './market-backups.service';
import { BackupQueryDto } from './dto/backup-query.dto';
import { UpdateBackupSettingsDto } from './dto/update-backup-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { extractRequestMeta } from '../../common/audit-log/request-meta.util';

// فقط ادمینِ همان مارکت (و سوپرادمین). بازگردانی عمداً route ندارد — فقط اپراتور با ابزارِ
// scripts/backup انجام می‌دهد.
@Controller('markets/:marketId')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class MarketBackupsController {
  constructor(private readonly backups: MarketBackupsService) {}

  @Post('backups')
  @HttpCode(202)
  create(@Req() req: any, @Param('marketId', ParseUUIDPipe) marketId: string) {
    return this.backups.createManual(req.user, marketId, extractRequestMeta(req));
  }

  @Get('backups')
  findAll(
    @Req() req: any,
    @Param('marketId', ParseUUIDPipe) marketId: string,
    @Query() query: BackupQueryDto,
  ) {
    return this.backups.findAll(req.user, marketId, query);
  }

  @Get('backups/:backupId')
  findOne(
    @Req() req: any,
    @Param('marketId', ParseUUIDPipe) marketId: string,
    @Param('backupId', ParseUUIDPipe) backupId: string,
  ) {
    return this.backups.findOne(req.user, marketId, backupId);
  }

  @Get('backups/:backupId/download')
  async download(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Param('marketId', ParseUUIDPipe) marketId: string,
    @Param('backupId', ParseUUIDPipe) backupId: string,
  ) {
    const { stream, size, filename } = await this.backups.getDownload(req.user, marketId, backupId, extractRequestMeta(req));
    res.set({
      'Content-Type': 'application/gzip',
      'Content-Length': String(size),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(stream);
  }

  @Get('backup-settings')
  getSettings(@Req() req: any, @Param('marketId', ParseUUIDPipe) marketId: string) {
    return this.backups.getSettings(req.user, marketId);
  }

  @Patch('backup-settings')
  updateSettings(
    @Req() req: any,
    @Param('marketId', ParseUUIDPipe) marketId: string,
    @Body() dto: UpdateBackupSettingsDto,
  ) {
    return this.backups.updateSettings(req.user, marketId, dto.autoBackupEnabled, extractRequestMeta(req));
  }
}
