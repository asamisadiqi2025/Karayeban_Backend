import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import {
  Logger,
  HttpStatus,
  RequestMethod,
  ValidationPipe,
  VersioningType,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import { HttpExceptionFilter } from './common/filters/http-exception-filter';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { UPLOAD_ROOT } from './modules/uploads/storage/local-disk-storage.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    // bufferLogs: تا app.useLogger واقعاً وصل شود، هر لاگِ بین این نقطه و آن نقطه
    // (مثلاً لاگ‌های خودِ Nest حین ساختن ماژول‌ها) بافر می‌شود و گم نمی‌رود.
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      bufferLogs: true,
    });
    app.useLogger(app.get(PinoLogger));

    // عمداً بیرون از app.setGlobalPrefix('api') — فایلِ استاتیک، بخشی از API نیست، پس
    // ورژن‌بندی (v1/v2) هم برایش معنی ندارد؛ آدرسش همیشه ثابت می‌ماند حتی اگر نسخهٔ API
    // عوض شود. توجه: هیچ Guardـی روی static assets اعمال نمی‌شود — یعنی هرکسی که URL
    // دقیقِ فایل را بداند می‌تواند ببیندش (مناسبِ لوگو/عکس پروفایل که اصلاً محرمانه
    // نیستند؛ برای فایلِ محرمانه این مسیر مناسب نیست).
    app.useStaticAssets(UPLOAD_ROOT, { prefix: '/uploads' });

     
    app.setGlobalPrefix('api', {
      exclude: [{ path: '/', method: RequestMethod.GET }],
    });
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

    // Register Custom Global Exception filter
    app.useGlobalFilters(new HttpExceptionFilter());

    // Register Global Validation pipeline
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        exceptionFactory: (errors) => {
          const fieldErrors: Record<string, string[]> = {};
          for (const error of errors) {
            fieldErrors[error.property] = Object.values(
              error.constraints ?? {},
            );
          }
          return new UnprocessableEntityException({
            message: 'Validation failed',
            errors: fieldErrors,
          });
        },
      }),
    );

    const corsOrigin = process.env.CORS_ORIGIN;
    app.enableCors({
      origin: corsOrigin
        ? corsOrigin.split(',').map((origin) => origin.trim())
        : true,
      credentials: true,
    });

    const reflector = app.get(Reflector);
    app.useGlobalGuards(new JwtAuthGuard(reflector));

    const port = Number(process.env.PORT) || 4000;
    await app.listen(port, '0.0.0.0');
    logger.log(`Application is running on: http://0.0.0.0:${port}`);
    logger.log(`✅ Database connection established successfully`);
  } catch (error) {
    logger.error(
      '❌ Failed to start application',
      error instanceof Error ? error.stack : String(error),
    );
    process.exit(1);
  }
}

bootstrap();
