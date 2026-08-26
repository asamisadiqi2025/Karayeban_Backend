import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    return new Pool({ connectionString });
  }

  const host = process.env.DB_HOST ?? process.env.DATABASE_HOST;
  const user = process.env.DB_USERNAME ?? process.env.DATABASE_USER;
  const password = process.env.DB_PASSWORD ?? process.env.DATABASE_PASSWORD;
  const database = process.env.DB_NAME ?? process.env.DATABASE_NAME;

  if (!host || !user || !database) {
    throw new Error(
      'DATABASE_URL is required (or DB_HOST / DATABASE_HOST, user, and database)',
    );
  }

  return new Pool({
    host,
    port: parseInt(
      process.env.DB_PORT ?? process.env.DATABASE_PORT ?? '5432',
      10,
    ),
    user,
    password,
    database,
  });
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ adapter: new PrismaPg(createPool()) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
