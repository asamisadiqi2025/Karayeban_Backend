import { INestApplication, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import basicAuth from 'express-basic-auth';
import { swaggerConfig } from './swagger.config';

/**
 * Mounts Swagger UI + the OpenAPI JSON document.
 *
 * Must be called AFTER `setGlobalPrefix` / `enableVersioning` so the generated
 * document reflects the real route paths. The UI is served at
 * `/{globalPrefix}/{SWAGGER_PATH}` (default: `/api/docs`) and the raw spec at
 * that path + `-json`.
 */
export function setupSwagger(app: INestApplication): void {
  const cfg = swaggerConfig();

  if (!cfg.enabled) {
    return;
  }

  const logger = new Logger('Swagger');

  // Optional HTTP Basic Auth gate in front of the UI + spec. Enabled only when
  // both SWAGGER_USER and SWAGGER_PASSWORD are set (recommended for production).
  if (cfg.user && cfg.password) {
    const uiPath = `/api/${cfg.path}`;
    app.use(
      [uiPath, `${uiPath}-json`, `${uiPath}-yaml`],
      basicAuth({
        challenge: true,
        users: { [cfg.user]: cfg.password },
      }),
    );
    logger.log('Swagger is protected with HTTP Basic Auth');
  }

  const documentConfig = new DocumentBuilder()
    .setTitle(cfg.title)
    .setDescription(cfg.description)
    .setVersion(cfg.version)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, documentConfig);

  SwaggerModule.setup(cfg.path, app, document, {
    useGlobalPrefix: true,
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  logger.log(`Swagger UI available at /api/${cfg.path}`);
}
