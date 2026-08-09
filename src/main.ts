import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  try {
    const app = await NestFactory.create(AppModule);
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