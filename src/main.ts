import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  Logger,
  HttpStatus,
  ValidationPipe,
  UnprocessableEntityException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception-filter';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard'; // 👈 اضافه شد

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule);

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

    // 👇 اضافه کردن Global JWT Guard
    const reflector = app.get(Reflector);
    app.useGlobalGuards(new JwtAuthGuard(reflector));

    const port = process.env.PORT ||  4000;
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