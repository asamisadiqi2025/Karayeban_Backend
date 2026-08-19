import { defineConfig } from 'prisma/config';
import dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required by prisma.config.ts');
}

export default defineConfig({
  schema: 'prisma/',

  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node --transpile-only prisma/seed.ts',
  },

  datasource: {
    url: databaseUrl,
  },
});