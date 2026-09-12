import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
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
import { PrismaModule } from './database/prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
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
  ],
  controllers: [AppController],
})
export class AppModule {}
