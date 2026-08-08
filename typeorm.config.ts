import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';

 config();

const configService = new ConfigService();

export default new DataSource({
  type: 'postgres',
  host: configService.get('DATABASE_HOST', 'localhost'),
  port: configService.get<number>('DATABASE_PORT', 5432),
  username: configService.get('DATABASE_USER', 'postgres'),
  password: configService.get('DATABASE_PASSWORD', 'postgres'),
  database: configService.get('DATABASE_NAME', 'karayeban_db'),
  entities: ['dist/**/*.entity.js'], // Entities will be compiled to dist
  migrations: ['dist/migrations/*.js'],
  synchronize: false, // IMPORTANT: false in production
  logging: configService.get('NODE_ENV') === 'development',
  poolSize: 10, // Connection pool size
  extra: {
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return an error if connection takes >2s
  },
});