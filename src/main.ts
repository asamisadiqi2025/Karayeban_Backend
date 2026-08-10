import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  Logger,
  HttpStatus,
  ValidationPipe,
  UnprocessableEntityException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception-filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule);

    // Register Custom Global Exception filter
    app.useGlobalFilters(new HttpExceptionFilter());

    // Register  Global Validation  pipeline setting
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

    // Configure application server port.

    const port = process.env.PORT || 3000;

    await app.listen(port);
    logger.log(`🚀 Application is running on: http://localhost:${port}`);
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
