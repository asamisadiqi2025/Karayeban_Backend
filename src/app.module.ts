import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { MarketModule } from './modules/market/market.module';
import { CurrenciesModule } from './modules/currencies/currencies.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { FloorsModule } from './modules/floors/floors.module';
import { ShopsModule } from './modules/shops/shops.module';
import { MetersModule } from './modules/meters/meters.module';
import { PrismaModule } from './database/prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UserModule,
    MarketModule,
    CurrenciesModule,
    AccountsModule,
    FloorsModule,
    ShopsModule,
    MetersModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
