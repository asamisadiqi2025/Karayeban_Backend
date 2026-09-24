import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CustomRolesService } from './custom-roles.service';
import { CreateCustomRoleDto } from './dto/create-custom-role.dto';
import { UpdateCustomRoleDto } from './dto/update-custom-role.dto';
import { CustomRoleQueryDto } from './dto/custom-role-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { extractRequestMeta } from '../../common/audit-log/request-meta.util';
import { PERMISSIONS } from '../../common/permissions/permissions.constant';

// فقط SUPER_ADMIN/ADMIN — تعریفِ نقش/دسترسی خودش یک عملِ حساس است، نه چیزی که
// ACCOUNTANT/STAFF بتوانند دست بزنند.
@Controller('custom-roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class CustomRolesController {
  constructor(private readonly customRolesService: CustomRolesService) {}

  // باید قبل از @Get(':id') ثبت شود، وگرنه Nest کلمهٔ "permissions" را به‌عنوان :id
  // تطبیق می‌دهد. لیستِ ثابتِ همهٔ permissionهایی که واقعاً روی حداقل یک endpoint وصل‌اند —
  // فرانت با همین می‌تواند چک‌باکسِ ساختنِ CustomRole را بسازد؛ هرچه اینجا هست، انتخابش
  // واقعاً اثر دارد.
  @Get('permissions')
  listPermissions() {
    return PERMISSIONS;
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateCustomRoleDto) {
    return this.customRolesService.create(req.user, dto, extractRequestMeta(req));
  }

  @Get()
  findAll(@Req() req: any, @Query() query: CustomRoleQueryDto) {
    return this.customRolesService.findAll(req.user, query);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.customRolesService.findOne(req.user, id);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateCustomRoleDto) {
    return this.customRolesService.update(req.user, id, dto, extractRequestMeta(req));
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.customRolesService.remove(req.user, id, extractRequestMeta(req));
  }
}
