import { Controller, Post, Body, UseGuards, Patch, Param, Get, Query, Req } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  async create(@Req() req: any, @Body() dto: CreateUserDto) {
    return this.userService.create(req.user, dto);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.userService.update(req.user, id, dto);
  }

  @Get('me')
  async me(@Req() req: any) {
    return this.userService.findMe(req.user.id);
  }

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN')
  async list(@Req() req: any, @Query() query: UserQueryDto) {
    return this.userService.findAll(query, req.user);
  }
}
