import 'dotenv/config';

import { DataSource } from 'typeorm';

export default new DataSource({
  type: 'postgres',

  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),

  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,

  database: process.env.DB_NAME,

  entities: ['src/modules/**/entities/*.entity.ts'],

  migrations: ['src/database/migrations/*.ts'],

  synchronize: false,

  logging: process.env.DB_LOGGING === 'true',

  poolSize: Number(process.env.DB_POOL_SIZE ?? 10),
});