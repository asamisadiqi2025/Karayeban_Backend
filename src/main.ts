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
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { Logger as PinoLogger } from 'nestjs-pino';
import { HttpExceptionFilter } from './common/filters/http-exception-filter';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { setupSwagger } from './config/swagger.setup';

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


    /**
     * CORS Configuration
     *
     * Coolify Environment Variable:
     *
     * CORS_ORIGIN=http://localhost:3000,https://your-frontend-domain.com
     *
     */

    const corsOrigin = process.env.CORS_ORIGIN;

    const allowedOrigins = corsOrigin
      ? corsOrigin
          .split(',')
          .map((origin) => origin.trim())
      : [
          'http://localhost:3000',
        ];


    const corsOptions: CorsOptions = {
      origin: (
        origin: string | undefined,
        callback: (
          error: Error | null,
          allow?: boolean,
        ) => void,
      ) => {

        // Allow requests without Origin header
        // (Postman, mobile apps, server-to-server)
        if (!origin) {
          return callback(null, true);
        }


        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }


        logger.warn(
          `Blocked CORS origin: ${origin}`,
        );


        return callback(null, false);
      },


      credentials: true,


      methods: [
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'OPTIONS',
      ],


      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Accept',
      ],
    };


    app.enableCors(corsOptions);



    /**
     * Global API Prefix
     *
     * Example:
     * POST /api/v1/auth/login
     */

    app.setGlobalPrefix('api', {
      exclude: [
        {
          path: '/',
          method: RequestMethod.GET,
        },
      ],
    });



    /**
     * API Versioning
     */

    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });



    /**
     * Swagger
     */

    setupSwagger(app);



    /**
     * Global Exception Filter
     */

    app.useGlobalFilters(
      new HttpExceptionFilter(),
    );



    /**
     * Global Validation
     */

    app.useGlobalPipes(
      new ValidationPipe({

        transform: true,

        whitelist: true,

        forbidNonWhitelisted: true,

        errorHttpStatusCode:
          HttpStatus.UNPROCESSABLE_ENTITY,


        exceptionFactory: (errors) => {

          const fieldErrors: Record<
            string,
            string[]
          > = {};


          for (const error of errors) {

            fieldErrors[error.property] =
              Object.values(
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



    /**
     * Global JWT Guard
     */

    const reflector = app.get(Reflector);

    app.useGlobalGuards(
      new JwtAuthGuard(reflector),
    );



    /**
     * Start Application
     */

    const port =
      Number(process.env.PORT) || 4000;


    await app.listen(
      port,
      '0.0.0.0',
    );


    logger.log(
      `Application is running on port ${port}`,
    );


    logger.log(
      `Allowed CORS origins: ${allowedOrigins.join(', ')}`,
    );


    logger.log(
      `✅ Database connection established successfully`,
    );


  } catch (error) {

    logger.error(
      '❌ Failed to start application',
      error instanceof Error
        ? error.stack
        : String(error),
    );


    process.exit(1);
  }
}


bootstrap();
