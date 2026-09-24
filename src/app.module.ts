import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { loggerConfig } from './config/logger.config';
import { AppController } from './app.controller';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { MarketModule } from './modules/market/market.module';
import { CurrenciesModule } from './modules/currencies/currencies.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { FloorsModule } from './modules/floors/floors.module';
import { ShopsModule } from './modules/shops/shops.module';
import { MetersModule } from './modules/meters/meters.module';
import { GuarantorsModule } from './modules/guarantors/guarantors.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { ShareholdersModule } from './modules/shareholders/shareholders.module';
import { AssetsModule } from './modules/assets/assets.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { RentModule } from './modules/rent/rent.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { ElectricityModule } from './modules/electricity/electricity.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { ReportsModule } from './modules/reports/reports.module';
import { PrismaModule } from './database/prisma/prisma.module';
import { AuditLogModule } from './common/audit-log/audit-log.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { CustomRolesModule } from './modules/custom-roles/custom-roles.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot(loggerConfig()),
    ScheduleModule.forRoot(),
    // پیش‌فرضِ سراسری سخاوتمندانه است (برای استفادهٔ عادیِ اپ محدودیت ایجاد نکند)؛
    // endpointهای حساس (لاگین) با @Throttle روی خودشان سخت‌گیرانه‌تر تنظیم می‌شوند.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 100,
      },
    ]),
    PrismaModule,
    AuditLogModule,
    AuditLogsModule,
    CustomRolesModule,
    AuthModule,
    UserModule,
    MarketModule,
    CurrenciesModule,
    AccountsModule,
    FloorsModule,
    ShopsModule,
    MetersModule,
    GuarantorsModule,
    TenantsModule,
    ShareholdersModule,
    AssetsModule,
    InventoryModule,
    ExpensesModule,
    RentModule,
    ContractsModule,
    ElectricityModule,
    UploadsModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
