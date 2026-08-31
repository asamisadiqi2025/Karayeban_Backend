import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  Logger,
  HttpStatus,
  RequestMethod,
  ValidationPipe,
  VersioningType,
  UnprocessableEntityException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception-filter';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { setupSwagger } from './config/swagger.setup';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule);

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
      ? corsOrigin.split(',').map((origin) => origin.trim())
      : ['http://localhost:3000'];

    app.enableCors({
      origin: (origin, callback) => {
        // Allow requests without origin:
        // - Postman
        // - Mobile apps
        // - Server-to-server requests
        if (!origin) {
          return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        logger.warn(`Blocked CORS origin: ${origin}`);
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
    });


    /**
     * API Prefix
     *
     * Routes:
     * GET  /
     * GET  /api/v1/...
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
          const fieldErrors: Record<string, string[]> = {};

          for (const error of errors) {
            fieldErrors[error.property] =
              Object.values(error.constraints ?? {});
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
     * Start Server
     */
    const port =
      Number(process.env.PORT) || 4000;

    await app.listen(
      port,
      '0.0.0.0',
    );


    logger.log(
      `Application running on port ${port}`,
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
