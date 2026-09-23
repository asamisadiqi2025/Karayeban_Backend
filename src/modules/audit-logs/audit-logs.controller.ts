import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

// دیدنِ خودِ audit trail یک عملِ حساس است — فقط SUPER_ADMIN/ADMIN، نه ACCOUNTANT/STAFF.
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  findAll(@Req() req: any, @Query() query: AuditLogQueryDto) {
    return this.auditLogsService.findAll(req.user, query);
  }

  // باید قبل از @Get(':id') ثبت شود، وگرنه Nest کلمهٔ "entity" را به‌عنوان :id تطبیق می‌دهد.
  @Get('entity/:entityType/:entityId')
  findForEntity(
    @Req() req: any,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.auditLogsService.findForEntity(req.user, entityType, entityId);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.auditLogsService.findOne(req.user, id);
  }
}
