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
import { GuarantorsService } from './guarantors.service';
import { CreateGuarantorDto } from './dto/create-guarantor.dto';
import { UpdateGuarantorDto } from './dto/update-guarantor.dto';
import { GuarantorQueryDto } from './dto/guarantor-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permission } from '../../common/decorators/permission.decorator';

@Controller('guarantors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GuarantorsController {
  constructor(private readonly guarantorsService: GuarantorsService) {}

  @Permission('guarantors.create')
  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Req() req: any, @Body() dto: CreateGuarantorDto) {
    return this.guarantorsService.create(req.user, dto);
  }

  @Permission('guarantors.view')
  @Get()
  findAll(@Req() req: any, @Query() query: GuarantorQueryDto) {
    return this.guarantorsService.findAll(req.user, query);
  }

  @Permission('guarantors.view')
  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.guarantorsService.findOne(req.user, id);
  }

  @Permission('guarantors.update')
  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateGuarantorDto) {
    return this.guarantorsService.update(req.user, id, dto);
  }

  @Permission('guarantors.delete')
  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.guarantorsService.remove(req.user, id);
  }
}
