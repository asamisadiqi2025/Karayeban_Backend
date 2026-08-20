// prisma/seed.ts
// ✅ Import از مسیر سفارشی Prisma Client
// ✅ برگشت به مسیر پیش‌فرض
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

// ==========================================
// ایجاد PrismaClient با adapter
// ==========================================
const connectionString = process.env.DATABASE_URL;
const pool = connectionString
  ? new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
  : new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD ? String(process.env.DB_PASSWORD) : undefined,
      database: process.env.DB_NAME,
      // optional: enable SSL if your production DB requires it
      // ssl: { rejectUnauthorized: false },
    });

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ==========================================
// Main Seed Function
// ==========================================
async function main() {
  console.log('🌱 Seeding database...');

  // ۰. ایجاد ارز افغانی (به‌عنوان ارز پایه)
  const afn = await prisma.currency.upsert({
    where: { code: 'AFN' },
    update: {},
    create: { code: 'AFN', name: 'افغانی' },
  });

  // ۱. ایجاد بازار (اگر وجود ندارد)
  const market = await prisma.market.upsert({
    where: { id: '11111111-1111-1111-1111-111111111111' },
    update: {},
    create: {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'بازار مرکزی',
      address: 'کابل، افغانستان',
      baseCurrencyId: afn.id,
      isSetupComplete: true,
    },
  });

  // ۲. ایجاد نقش super_admin (سیستمی)
  await prisma.customRole.upsert({
    where: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
    update: {},
    create: {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      name: 'super_admin',
      marketId: market.id,
      permissions: ['*'],
      isSystem: true,
      description: 'دسترسی کامل به سیستم',
    },
  });

  // ۳. ایجاد نقش accountant (سیستمی)
  await prisma.customRole.upsert({
    where: { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' },
    update: {},
    create: {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      name: 'accountant',
      marketId: market.id,
      permissions: [
        'rent:collect',
        'rent:read',
        'expense:read',
        'expense:write',
        'report:read',
        'report:export',
      ],
      isSystem: true,
      description: 'نقش پیش‌فرض حسابدار',
    },
  });

  // ۴. ایجاد سوپرادمین (اگر وجود ندارد)
  const existingAdmin = await prisma.user.findFirst({
    where: { isSuperAdmin: true },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('Admin@123', 10);

    await prisma.user.create({
      data: {
        email: 'admin@karayeban.com',
        username: 'admin',
        passwordHash: hashedPassword,
        fullName: 'مدیر سیستم',
        isSuperAdmin: true,
        marketId: market.id,
        role: "SUPER_ADMIN",
        isActive: true,
      },
    });
    console.log('✅ سوپرادمین با ایمیل admin@karayeban.com و رمز Admin@123 ایجاد شد.');
  } else {
    console.log('✅ سوپرادمین قبلاً وجود دارد.');
  }

  console.log('✅ Seed completed successfully!');
}

// ==========================================
// اجرای Seed با مدیریت خطا
// ==========================================
main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });