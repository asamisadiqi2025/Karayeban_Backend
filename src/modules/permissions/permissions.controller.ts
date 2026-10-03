import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put, Req, UseGuards } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { SetUserPermissionsDto } from './dto/set-user-permissions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { extractRequestMeta } from '../../common/audit-log/request-meta.util';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  // فهرستِ همهٔ کارهای سیستم (گروه‌بندی‌شده) — برای ساختنِ فرمِ چک‌باکس.
  @Get('permissions')
  @Roles('SUPER_ADMIN', 'ADMIN')
  catalog() {
    return this.permissionsService.getCatalog();
  }

  // دسترسی‌های «خودِ» کاربرِ جاری — برای مخفی/نمایش دادنِ منوها در فرانت.
  @Get('permissions/me')
  mine(@Req() req: any) {
    return this.permissionsService.getMine(req.user);
  }

  @Get('users/:id/permissions')
  @Roles('SUPER_ADMIN', 'ADMIN')
  getForUser(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.permissionsService.getForUser(req.user, id);
  }

  @Put('users/:id/permissions')
  @Roles('SUPER_ADMIN', 'ADMIN')
  setForUser(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetUserPermissionsDto,
  ) {
    return this.permissionsService.setForUser(req.user, id, dto.permissions, extractRequestMeta(req));
  }

  // برگرداندنِ کاربر به دسترسی‌های پیش‌فرضِ نقشش.
  @Delete('users/:id/permissions')
  @Roles('SUPER_ADMIN', 'ADMIN')
  resetForUser(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.permissionsService.resetForUser(req.user, id, extractRequestMeta(req));
  }
}
