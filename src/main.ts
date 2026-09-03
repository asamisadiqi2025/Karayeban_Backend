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

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule);

     
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
