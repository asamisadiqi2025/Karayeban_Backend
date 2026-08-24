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
const isLocalHost = connectionString ? ['localhost', '127.0.0.1'].includes(new URL(connectionString).hostname) : false;
const pool = connectionString
  ? new Pool({ connectionString, ssl: isLocalHost ? false : { rejectUnauthorized: false } })
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

  // فقط سوپرادمین ساخته می‌شود — بدون ارز/مارکت/نقش خودکار.
  // بقیه (اضافه‌کردن ارز، ستاپ کمپنی، نرخ ارز، بانک‌ها) باید از طریق فلوی واقعی برنامه انجام شود.
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
        role: 'SUPER_ADMIN',
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