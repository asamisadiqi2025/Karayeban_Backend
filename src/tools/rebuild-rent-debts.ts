/* eslint-disable no-console */
// ابزارِ اپراتور: بازسازیِ کاملِ کشِ «بدهیِ کرایه» (جدول rent_debts) از روی فاکتورهای باز (rent_charges).
//
// RentDebt یک کشِ مشتق است و فقط با رویدادها (پرداخت/فاکتور/فسخ) به‌روز می‌شود. این ابزار آن را برای «همهٔ»
// مستأجرها از نو می‌سازد و idempotent است (هر چند بار اجرا شود نتیجه یکی است؛ فقط جدولِ مشتق را می‌نویسد،
// هیچ پرداخت/فاکتور/حسابی دست نمی‌خورد، و فیلدهای دستیِ notes/riskScore حفظ می‌شود).
// چه وقت: بعد از مهاجرتِ «بدهی به‌تفکیکِ ارز»، یا هر وقت ردیفی کهنه/جاافتاده دیده شد.
//
// استفاده (روی سرور، داخلِ کانتینر):  node dist/tools/rebuild-rent-debts.js
// (در توسعه:  npm run rent-debts:rebuild)
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { RentService } from '../modules/rent/rent.service';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('✗ DATABASE_URL تنظیم نیست');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    // بازسازی فقط به prisma نیاز دارد؛ auditLog در این مسیر استفاده نمی‌شود.
    const service = new RentService(prisma as never, {} as never);
    const result = await service.rebuildAllRentDebts();
    console.log(`✓ بدهیِ کرایهٔ ${result.tenants} مستأجر بازسازی شد`);
    if (result.failed.length > 0) {
      console.error(
        `✗ ${result.failed.length} مستأجر ناموفق بود (بقیه انجام شد):`,
      );
      for (const id of result.failed) console.error('   - ' + id);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('✗ خطا:', e instanceof Error ? e.message : e);
  process.exit(1);
});
