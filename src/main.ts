import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

import { AppValidationPipe } from './common/pipes/validation.pipe';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  app.use(cookieParser());

  app.enableCors({
    origin:
      configService.get<string>('FRONTEND_URL') ??
      'http://localhost:3000',

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
    ],
  });

  app.useGlobalPipes(AppValidationPipe);

  app.useGlobalFilters(new HttpExceptionFilter());

  

  // ==============================
  // Swagger Documentation
  // ==============================

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Market Management API')
    .setDescription(
      'REST API documentation for Market Management SaaS Platform',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'access-token',
    )
    .build();


  const swaggerDocument = SwaggerModule.createDocument(
    app,
    swaggerConfig,
  );


  SwaggerModule.setup(
    'api/docs',
    app,
    swaggerDocument,
    {
      swaggerOptions: {
        persistAuthorization: true,
      },
    },
  );



  const port = configService.get<number>('PORT') ?? 3000;

  await app.listen(port);

  console.log(`🚀 Server running on http://localhost:${port}`);
    console.log(
    `📚 Swagger running on http://localhost:${port}/api/docs`,
  );
}

bootstrap();