import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MiscellaneousIncomeService } from './miscellaneous-income.service';
import { CreateMiscellaneousIncomeCategoryDto } from './dto/create-miscellaneous-income-category.dto';
import { UpdateMiscellaneousIncomeCategoryDto } from './dto/update-miscellaneous-income-category.dto';
import { MiscellaneousIncomeCategoryQueryDto } from './dto/miscellaneous-income-category-query.dto';
import { CreateMiscellaneousIncomeDto } from './dto/create-miscellaneous-income.dto';
import { UpdateMiscellaneousIncomeDto } from './dto/update-miscellaneous-income.dto';
import { MiscellaneousIncomeQueryDto } from './dto/miscellaneous-income-query.dto';
import { MiscellaneousIncomeSummaryQueryDto } from './dto/miscellaneous-income-summary-query.dto';
import { MiscellaneousIncomeBreakdownQueryDto } from './dto/miscellaneous-income-breakdown-query.dto';
import { RemoveMiscellaneousIncomeDto } from './dto/remove-miscellaneous-income.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { extractRequestMeta } from '../../common/audit-log/request-meta.util';
import { IDEMPOTENCY_HEADER, parseIdempotencyKey } from '../../common/idempotency/idempotency';

@Controller('miscellaneous-income')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MiscellaneousIncomeController {
  constructor(private readonly incomeService: MiscellaneousIncomeService) {}

  // ---------- دسته‌بندی‌ها ----------

  @Permission('misc_income.manage_categories')
  @Post('categories')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
  createCategory(@Req() req: any, @Body() dto: CreateMiscellaneousIncomeCategoryDto) {
    return this.incomeService.createCategory(req.user, dto, extractRequestMeta(req));
  }

  @Permission('misc_income.view')
  @Get('categories')
  findAllCategories(@Req() req: any, @Query() query: MiscellaneousIncomeCategoryQueryDto) {
    return this.incomeService.findAllCategories(req.user, query);
  }

  @Permission('misc_income.view')
  @Get('categories/:id')
  findOneCategory(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.incomeService.findOneCategory(req.user, id);
  }

  @Permission('misc_income.manage_categories')
  @Patch('categories/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
  updateCategory(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMiscellaneousIncomeCategoryDto,
  ) {
    return this.incomeService.updateCategory(req.user, id, dto, extractRequestMeta(req));
  }

  @Permission('misc_income.manage_categories')
  @Delete('categories/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  removeCategory(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.incomeService.removeCategory(req.user, id, extractRequestMeta(req));
  }

  // ---------- عواید متفرقه ----------

  // Idempotency-Key (اختیاری): ثبتِ عایدی حساب را شارژ می‌کند؛ با همین هدر، تلاشِ دوبارهٔ همان ارسال
  // (دابل‌کلیک، قطعیِ شبکه) عایدیِ دوم نمی‌سازد و پاسخِ اولی برمی‌گردد. نیاید = رفتارِ ساده.
  @Permission('misc_income.create')
  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
  createIncome(
    @Req() req: any,
    @Body() dto: CreateMiscellaneousIncomeDto,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey?: string,
  ) {
    return this.incomeService.createIncome(
      req.user,
      dto,
      extractRequestMeta(req),
      parseIdempotencyKey(idempotencyKey),
    );
  }

  @Permission('misc_income.view')
  @Get()
  findAllIncomes(@Req() req: any, @Query() query: MiscellaneousIncomeQueryDto) {
    return this.incomeService.findAllIncomes(req.user, query);
  }

  // باید قبل از @Get(':id') ثبت شود، وگرنه Nest کلمهٔ "summary" را به‌عنوان :id تطبیق می‌دهد.
  @Permission('misc_income.view')
  @Get('summary')
  getIncomeSummary(@Req() req: any, @Query() query: MiscellaneousIncomeSummaryQueryDto) {
    return this.incomeService.getIncomeSummary(req.user, query);
  }

  // باید قبل از @Get(':id') ثبت شود، وگرنه Nest کلمهٔ "breakdown" را به‌عنوان :id تطبیق می‌دهد.
  @Permission('misc_income.view')
  @Get('breakdown')
  getIncomeBreakdown(@Req() req: any, @Query() query: MiscellaneousIncomeBreakdownQueryDto) {
    return this.incomeService.getIncomeBreakdown(req.user, query);
  }

  @Permission('misc_income.view')
  @Get(':id')
  findOneIncome(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.incomeService.findOneIncome(req.user, id);
  }

  @Permission('misc_income.update')
  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
  updateIncome(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMiscellaneousIncomeDto,
  ) {
    return this.incomeService.updateIncome(req.user, id, dto, extractRequestMeta(req));
  }

  // دلیلِ حذف به‌صورت query می‌آید: DELETE /miscellaneous-income/:id?reason=...
  @Permission('misc_income.delete')
  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  removeIncome(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: RemoveMiscellaneousIncomeDto,
  ) {
    return this.incomeService.removeIncome(req.user, id, query, extractRequestMeta(req));
  }
}
