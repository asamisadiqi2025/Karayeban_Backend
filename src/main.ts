// import { NestFactory } from '@nestjs/core';
// import { ConfigService } from '@nestjs/config';
// import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
// import { AppModule } from './app.module';

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);

//   app.useGlobalInterceptors(
//   new TransformResponseInterceptor(),
// );

//   const configService = app.get(ConfigService);

//   const port = configService.get<number>('PORT') ?? 3000;

//   await app.listen(port);

//   console.log(`🚀 Server is running on http://localhost:${port}`);
// }

// bootstrap();


import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,            // فیلدهای اضافی حذف شوند
      forbidNonWhitelisted: true, // فیلد ناشناس → خطا
      transform: true,            // تبدیل خودکار نوع‌ها
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();