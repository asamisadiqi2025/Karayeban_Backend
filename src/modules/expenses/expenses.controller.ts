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
import { ExpensesService } from './expenses.service';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import { ExpenseCategoryQueryDto } from './dto/expense-category-query.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { ExpenseSummaryQueryDto } from './dto/expense-summary-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  // ---------- دسته‌بندی‌ها ----------

  @Post('categories')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
  createCategory(@Req() req: any, @Body() dto: CreateExpenseCategoryDto) {
    return this.expensesService.createCategory(req.user, dto);
  }

  @Get('categories')
  findAllCategories(@Req() req: any, @Query() query: ExpenseCategoryQueryDto) {
    return this.expensesService.findAllCategories(req.user, query);
  }

  @Get('categories/:id')
  findOneCategory(@Req() req: any, @Param('id') id: string) {
    return this.expensesService.findOneCategory(req.user, id);
  }

  @Patch('categories/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
  updateCategory(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateExpenseCategoryDto) {
    return this.expensesService.updateCategory(req.user, id, dto);
  }

  @Delete('categories/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  removeCategory(@Req() req: any, @Param('id') id: string) {
    return this.expensesService.removeCategory(req.user, id);
  }

  // ---------- مصارف ----------

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
  createExpense(@Req() req: any, @Body() dto: CreateExpenseDto) {
    return this.expensesService.createExpense(req.user, dto);
  }

  @Get()
  findAllExpenses(@Req() req: any, @Query() query: ExpenseQueryDto) {
    return this.expensesService.findAllExpenses(req.user, query);
  }

  // باید قبل از @Get(':id') ثبت شود، وگرنه Nest کلمهٔ "summary" را به‌عنوان :id تطبیق می‌دهد.
  @Get('summary')
  getExpenseSummary(@Req() req: any, @Query() query: ExpenseSummaryQueryDto) {
    return this.expensesService.getExpenseSummary(req.user, query);
  }

  @Get(':id')
  findOneExpense(@Req() req: any, @Param('id') id: string) {
    return this.expensesService.findOneExpense(req.user, id);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
  updateExpense(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return this.expensesService.updateExpense(req.user, id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  removeExpense(@Req() req: any, @Param('id') id: string) {
    return this.expensesService.removeExpense(req.user, id);
  }
}
