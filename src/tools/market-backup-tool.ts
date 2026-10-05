/* eslint-disable no-console */
// ابزارِ اپراتور برای بک‌آپِ یک مارکت (فقط ما اجرا می‌کنیم؛ ادمینِ مارکت route ی برای بازگردانی ندارد).
//
//   verify  : سالم بودنِ فایل را می‌سنجد (قالب، شمارشِ ردیف‌ها، sha256) — هیچ‌چیز را عوض نمی‌کند.
//   restore : داده‌های «همان مارکت» را از فایل جایگزین می‌کند. بدونِ --confirm-market-id فقط
//             گزارشِ آزمایشی (dry-run) می‌دهد. مارکت‌های دیگر دست نمی‌خورند.
//
// استفاده (روی سرور، داخلِ کانتینر):
//   node dist/tools/market-backup-tool.js verify  <file.ndjson.gz> [--sha256 <hash>]
//   node dist/tools/market-backup-tool.js restore <file.ndjson.gz> [--confirm-market-id <id>] [--allow-schema-mismatch]
// (در توسعه: npm run backup:verify -- <file> / npm run backup:restore -- <file> ...)
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { createGunzip } from 'zlib';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { BACKUP_REGISTRY, buildWhere, delegateName, assertRegistryComplete } from '../modules/backups/backup-registry';
import { Prisma } from '@prisma/client';

interface Parsed {
  header: { format: string; version: number; marketId: string; backupId: string; createdAt: string; schemaVersion: string };
  footer: { rowCounts: Record<string, number>; totalRows: number };
  rowsByModel: Map<string, any[]>;
  counted: Record<string, number>;
}

// Prisma در createMany برای ستون‌های Json که null هستند حتماً Prisma.DbNull می‌خواهد، نه null ساده.
const JSON_FIELDS = new Map<string, string[]>(
  Prisma.dmmf.datamodel.models.map((m) => [m.name, m.fields.filter((f) => f.type === 'Json').map((f) => f.name)]),
);
function fixRow(model: string, row: any): any {
  const jsonFields = JSON_FIELDS.get(model) ?? [];
  if (jsonFields.length === 0) return row;
  const copy = { ...row };
  for (const f of jsonFields) if (copy[f] === null) copy[f] = Prisma.DbNull;
  return copy;
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function sha256Of(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function parseBackup(file: string, keepRows: boolean): Promise<Parsed> {
  const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  let header: Parsed['header'] | null = null;
  let footer: Parsed['footer'] | null = null;
  const rowsByModel = new Map<string, any[]>();
  const counted: Record<string, number> = {};
  const known = new Set(BACKUP_REGISTRY.map((e) => e.model));
  let lineNo = 0;

  for await (const line of lines) {
    lineNo++;
    if (!line.trim()) continue;
    let obj: any;
    try {
      obj = JSON.parse(line);
    } catch {
      fail(`خطِ ${lineNo} JSON معتبر نیست (فایل ناقص یا خراب است)`);
    }
    if (obj.type === 'header') {
      if (header) fail('بیش از یک header در فایل هست');
      header = obj;
    } else if (obj.type === 'row') {
      if (!header) fail('ردیف قبل از header آمده است');
      if (!known.has(obj.model)) fail(`مدلِ ناشناخته در فایل: ${obj.model}`);
      counted[obj.model] = (counted[obj.model] ?? 0) + 1;
      if (keepRows) {
        const list = rowsByModel.get(obj.model) ?? [];
        list.push(obj.data);
        rowsByModel.set(obj.model, list);
      }
    } else if (obj.type === 'footer') {
      footer = obj;
    } else {
      fail(`نوعِ خطِ ناشناخته در خطِ ${lineNo}`);
    }
  }

  if (!header) fail('header ندارد');
  if (!footer) fail('footer ندارد — فایل ناقص است (احتمالاً آپلود/دانلود نیمه‌کاره مانده)');
  if (header.format !== 'karayeban-market-backup') fail(`قالبِ ناشناخته: ${header.format}`);
  if (header.version !== 1) fail(`نسخهٔ قالبِ پشتیبانی‌نشده: ${header.version}`);

  let totalCounted = 0;
  for (const entry of BACKUP_REGISTRY) {
    const expected = footer.rowCounts[entry.model] ?? 0;
    const actual = counted[entry.model] ?? 0;
    if (expected !== actual) fail(`شمارشِ ردیف‌های ${entry.model} نمی‌خواند: footer=${expected}، فایل=${actual}`);
    totalCounted += actual;
  }
  if (totalCounted !== footer.totalRows) fail(`مجموعِ ردیف‌ها نمی‌خواند: footer=${footer.totalRows}، فایل=${totalCounted}`);

  return { header, footer, rowsByModel, counted };
}

function printSummary(p: Parsed) {
  console.log(`  مارکت       : ${p.header.marketId}`);
  console.log(`  ساخته‌شده    : ${p.header.createdAt}`);
  console.log(`  نسخهٔ schema : ${p.header.schemaVersion}`);
  console.log(`  مجموعِ ردیف  : ${p.footer.totalRows}`);
  const nonEmpty = BACKUP_REGISTRY.filter((e) => (p.counted[e.model] ?? 0) > 0);
  console.log('  جدول‌ها      : ' + nonEmpty.map((e) => `${e.model}=${p.counted[e.model]}`).join(', '));
}

async function verify(file: string, expectedSha: string | undefined) {
  assertRegistryComplete(Prisma.dmmf.datamodel.models.map((m) => m.name));
  console.log(`بررسیِ ${file} ...`);
  const sha = await sha256Of(file);
  console.log(`  sha256       : ${sha}`);
  if (expectedSha && expectedSha.toLowerCase() !== sha) fail(`sha256 با مقدارِ انتظاری نمی‌خواند (${expectedSha})`);
  const parsed = await parseBackup(file, false);
  printSummary(parsed);
  console.log('✓ فایل سالم است');
}

async function restore(file: string, opts: { confirmMarketId?: string; allowSchemaMismatch: boolean }) {
  assertRegistryComplete(Prisma.dmmf.datamodel.models.map((m) => m.name));
  console.log(`خواندن و بررسیِ ${file} ...`);
  const parsed = await parseBackup(file, true);
  printSummary(parsed);
  const marketId = parsed.header.marketId;

  const url = process.env.DATABASE_URL;
  if (!url) fail('DATABASE_URL تنظیم نیست');
  const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });

  try {
    const target = new URL(url);
    console.log(`  دیتابیسِ مقصد: ${target.hostname}:${target.port || 5432}${target.pathname}`);

    const applied = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`;
    const currentSchema = applied[0]?.migration_name ?? 'unknown';
    console.log(`  schema مقصد  : ${currentSchema}`);
    if (currentSchema !== parsed.header.schemaVersion && !opts.allowSchemaMismatch) {
      fail(
        `نسخهٔ schemaِ فایل (${parsed.header.schemaVersion}) با دیتابیسِ مقصد (${currentSchema}) فرق دارد؛ ` +
          `اگر مطمئنید --allow-schema-mismatch بدهید`,
      );
    }

    const existing = await prisma.market.findUnique({ where: { id: marketId }, select: { id: true } });
    console.log(`  مارکت در مقصد: ${existing ? 'وجود دارد (جایگزین می‌شود)' : 'وجود ندارد (ساخته می‌شود)'}`);

    if (opts.confirmMarketId !== marketId) {
      console.log('\nگزارشِ آزمایشی (dry-run) بود؛ هیچ تغییری داده نشد.');
      console.log(`برای اجرای واقعی همین دستور را با --confirm-market-id ${marketId} بزنید.`);
      return;
    }

    console.log('\nشروع بازگردانی (در یک تراکنش؛ اگر خطا بدهد هیچ‌چیز عوض نمی‌شود) ...');
    const lockedUsers: string[] = [];

    await prisma.$transaction(
      async (tx) => {
        try {
          await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);
        } catch (e) {
          fail(`تنظیمِ session_replication_role ممکن نشد — برای بازگردانی باید با یوزرِ superuser (مثلاً postgres) وصل شوید: ${(e as Error).message}`);
        }

        // رمزِ فعلیِ کاربرانی که هنوز وجود دارند نگه داشته می‌شود (در فایل رمزی نیست).
        const keptHashes = new Map<string, { passwordHash: string; passwordChangedAt: Date | null }>(
          (await tx.user.findMany({ where: { marketId }, select: { id: true, passwordHash: true, passwordChangedAt: true } })).map(
            (u) => [u.id, { passwordHash: u.passwordHash, passwordChangedAt: u.passwordChangedAt }],
          ),
        );

        // حذفِ داده‌های فعلیِ همین مارکت (به ترتیبِ معکوس). AuditLog فقط‌افزودنی است: نه پاک می‌شود، نه
        // دوباره‌نویسی؛ فقط ردیف‌های گم‌شده به آن برمی‌گردند.
        for (const entry of [...BACKUP_REGISTRY].reverse()) {
          if (entry.model === 'AuditLog') continue;
          await (tx as any)[delegateName(entry.model)].deleteMany({ where: buildWhere(entry, marketId) });
        }

        for (const entry of BACKUP_REGISTRY) {
          const rows = parsed.rowsByModel.get(entry.model) ?? [];
          if (rows.length === 0) continue;
          let data = rows;
          if (entry.model === 'User') {
            data = [];
            for (const r of rows) {
              const kept = keptHashes.get(r.id);
              if (kept) {
                data.push({ ...r, passwordHash: kept.passwordHash, passwordChangedAt: kept.passwordChangedAt });
              } else {
                lockedUsers.push(`${r.username} (${r.email})`);
                data.push({ ...r, passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 10), passwordChangedAt: new Date() });
              }
            }
          }
          for (let i = 0; i < data.length; i += 500) {
            await (tx as any)[delegateName(entry.model)].createMany({
              data: data.slice(i, i + 500).map((r) => fixRow(entry.model, r)),
              ...(entry.model === 'AuditLog' ? { skipDuplicates: true } : {}),
            });
          }
          console.log(`  ✓ ${entry.model}: ${rows.length}`);
        }

        // تأییدِ نهایی داخلِ همان تراکنش: شمارشِ هر جدول با فایل یکی باشد.
        for (const entry of BACKUP_REGISTRY) {
          const expected = parsed.counted[entry.model] ?? 0;
          const actual: number = await (tx as any)[delegateName(entry.model)].count({ where: buildWhere(entry, marketId) });
          const ok = entry.model === 'AuditLog' ? actual >= expected : actual === expected;
          if (!ok) throw new Error(`پس از بازگردانی شمارشِ ${entry.model} نمی‌خواند: انتظار ${expected}، موجود ${actual}`);
        }
      },
      { timeout: 30 * 60 * 1000, maxWait: 30_000 },
    );

    console.log('\n✓ بازگردانی کامل شد و شمارش‌ها با فایل یکی است.');
    if (lockedUsers.length > 0) {
      console.log(`\n⚠ ${lockedUsers.length} کاربر در مقصد نبودند و با رمزِ قفل‌شده ساخته شدند (رمزشان در بک‌آپ نیست).`);
      console.log('  ادمینِ مارکت باید رمزِ آن‌ها را عوض کند (PATCH /users/:id/password):');
      for (const u of lockedUsers) console.log('   - ' + u);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const [command, file, ...rest] = process.argv.slice(2);
  if (!command || !file || !['verify', 'restore'].includes(command)) {
    fail('استفاده: market-backup-tool <verify|restore> <file.ndjson.gz> [گزینه‌ها]');
  }
  const flag = (name: string) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  if (command === 'verify') return verify(file, flag('--sha256'));
  return restore(file, {
    confirmMarketId: flag('--confirm-market-id'),
    allowSchemaMismatch: rest.includes('--allow-schema-mismatch'),
  });
}

main().catch((e) => {
  console.error('✗ خطا:', e instanceof Error ? e.message : e);
  process.exit(1);
});
