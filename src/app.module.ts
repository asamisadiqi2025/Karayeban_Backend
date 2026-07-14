// import { Module } from '@nestjs/common';
// import { AppController } from './app.controller';
// import { AppService } from './app.service';
// import { ConfigModule } from '@nestjs/config';
// import { PrismaModule } from './prisma/prisma.module';

// @Module({
//   imports: [
//     ConfigModule.forRoot({
//       isGlobal: true,
//     }),
//     PrismaModule,
//   ],
//   controllers: [AppController],
//   providers: [AppService],
// })
// export class AppModule {}


import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RolesGuard } from './auth/guards/roles.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { JwtAuthGuard } from './auth/guards/jwt.guard';
// import { JwtGuard } from './auth/guards/jwt.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // خواندن .env در کل برنامه
    PrismaModule,
    AuthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },     // ۱) توکن
    { provide: APP_GUARD, useClass: RolesGuard },        // ۲) نقش
    { provide: APP_GUARD, useClass: PermissionsGuard },  // ۳) مجوز
  ],
})
export class AppModule {}