import {
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { once } from 'events';
import { createReadStream, createWriteStream, existsSync, readdirSync } from 'fs';
import { mkdir, rename, stat, unlink } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';
import { createGzip } from 'zlib';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../common/audit-log/audit-log.service';
import { RequestMeta } from '../../common/audit-log/request-meta.util';
import { paginate } from '../../common/utils/pagination';
import { kabulTimeOnSameDay } from '../../common/utils/kabul-date';
import { BackupQueryDto } from './dto/backup-query.dto';
import {
  BACKUP_REGISTRY,
  assertRegistryComplete,
  buildWhere,
  delegateName,
} from './backup-registry';

type Actor = { id: string; role: string; marketId: string | null };

const BATCH = 1000;
const TX_TIMEOUT_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const FORMAT = 'karayeban-market-backup';
const FORMAT_VERSION = 1;

const jsonReplacer = (_key: string, value: unknown) => (typeof value === 'bigint' ? value.toString() : value);

@Injectable()
export class MarketBackupsService implements OnModuleInit {
  private readonly logger = new Logger(MarketBackupsService.name);
  private readonly dir: string;
  private readonly autoRetentionDays: number;
  private readonly manualRetentionDays: number;
  // ساعتِ بک‌آپِ خودکار به وقتِ کابل («HH:mm»)؛ برای همهٔ مارکت‌ها یکی است.
  private readonly backupTime: string;
  private readonly modelsWithId = new Set<string>();
  private schemaVersionCache: string | null = null;
  // یک بک‌آپ در هر لحظه (برای فشار نیامدن به دیتابیس)؛ بقیه پشتِ سرِ هم اجرا می‌شوند.
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    config: ConfigService,
  ) {
    this.dir = resolve(process.cwd(), config.get<string>('BACKUP_DIR') || 'backups');
    this.autoRetentionDays = Number(config.get<string>('BACKUP_AUTO_RETENTION_DAYS') ?? 7);
    this.manualRetentionDays = Number(config.get<string>('BACKUP_MANUAL_RETENTION_DAYS') ?? 30);

    const configured = config.get<string>('BACKUP_TIME') || '02:30';
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(configured)) {
      this.backupTime = configured;
    } else {
      this.backupTime = '02:30';
      this.logger.warn(`BACKUP_TIME «${configured}» معتبر نیست (باید HH:mm باشد)؛ ساعتِ ۰۲:۳۰ استفاده شد`);
    }
  }

  async onModuleInit() {
    const models = Prisma.dmmf.datamodel.models;
    assertRegistryComplete(models.map((m) => m.name));
    for (const m of models) if (m.fields.some((f) => f.name === 'id')) this.modelsWithId.add(m.name);

    await mkdir(this.dir, { recursive: true });

    // کارهایی که با خاموش شدنِ سرور نیمه‌کاره ماندند دیگر هرگز تمام نمی‌شوند.
    const stuck = await this.prisma.marketBackup.updateMany({
      where: { status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'FAILED', error: 'با خاموش یا ریستارت شدنِ سرور نیمه‌کاره ماند', finishedAt: new Date() },
    });
    if (stuck.count > 0) this.logger.warn(`${stuck.count} بک‌آپِ نیمه‌کاره FAILED شد`);
  }

  // ---------------------------------------------------------------- helpers

  private async getActor(currentUser: { id: string }): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, role: true, marketId: true },
    });
    if (!user) throw new ForbiddenException('کاربر معتبر نیست');
    return user;
  }

  private ensureAccess(actor: Actor, marketId: string) {
    if (actor.role === 'SUPER_ADMIN') return;
    if (actor.role !== 'ADMIN' || actor.marketId !== marketId) {
      throw new ForbiddenException('دسترسی به بک‌آپِ این مارکت مجاز نیست');
    }
  }

  private async assertMarketExists(marketId: string) {
    const market = await this.prisma.market.findUnique({ where: { id: marketId }, select: { id: true } });
    if (!market) throw new NotFoundException('مارکت یافت نشد');
  }

  private schemaVersion(): string {
    if (this.schemaVersionCache) return this.schemaVersionCache;
    try {
      const migrationsDir = join(process.cwd(), 'prisma', 'migrations');
      const names = readdirSync(migrationsDir).filter((n) => /^\d/.test(n)).sort();
      this.schemaVersionCache = names[names.length - 1] ?? 'unknown';
    } catch {
      this.schemaVersionCache = 'unknown';
    }
    return this.schemaVersionCache;
  }

  // مسیرِ فایل فقط از fileKeyِ خودمان ساخته می‌شود و حتماً باید داخلِ BACKUP_DIR بماند.
  private pathFor(fileKey: string): string {
    const full = resolve(this.dir, fileKey);
    if (!full.startsWith(this.dir + sep)) throw new ForbiddenException('مسیر نامعتبر');
    return full;
  }

  private toPublic<T extends { fileKey?: string | null }>(backup: T): Omit<T, 'fileKey'> {
    const { fileKey: _fileKey, ...rest } = backup;
    return rest;
  }

  // ---------------------------------------------------------------- API

  async createManual(currentUser: { id: string }, marketId: string, meta: RequestMeta) {
    const actor = await this.getActor(currentUser);
    this.ensureAccess(actor, marketId);
    await this.assertMarketExists(marketId);

    const active = await this.prisma.marketBackup.count({
      where: { marketId, status: { in: ['PENDING', 'RUNNING'] } },
    });
    if (active > 0) {
      throw new ConflictException('یک بک‌آپ برای این مارکت در حال انجام است؛ صبر کنید تا تمام شود');
    }
    const recentManual = await this.prisma.marketBackup.count({
      where: { marketId, kind: 'MANUAL', createdAt: { gte: new Date(Date.now() - DAY_MS) } },
    });
    if (recentManual >= 10) {
      throw new HttpException('در هر ۲۴ ساعت حداکثر ۱۰ بک‌آپِ دستی مجاز است', HttpStatus.TOO_MANY_REQUESTS);
    }

    const backup = await this.prisma.marketBackup.create({
      data: { marketId, kind: 'MANUAL', requestedById: actor.id },
    });

    await this.auditLog.record({
      action: 'CREATE',
      entityType: 'MarketBackup',
      entityId: backup.id,
      marketId,
      userId: actor.id,
      newData: { kind: 'MANUAL' },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    this.enqueue(backup.id);
    return this.toPublic(backup);
  }

  async findAll(currentUser: { id: string }, marketId: string, query: BackupQueryDto) {
    const actor = await this.getActor(currentUser);
    this.ensureAccess(actor, marketId);

    const where: Prisma.MarketBackupWhereInput = { marketId };
    if (query.status) where.status = query.status;
    if (query.kind) where.kind = query.kind;

    const result = await paginate(this.prisma.marketBackup, {
      where,
      orderBy: { createdAt: 'desc' },
      page: query.page,
      limit: query.limit,
    });
    return { ...result, data: result.data.map((b: any) => this.toPublic(b)) };
  }

  async findOne(currentUser: { id: string }, marketId: string, backupId: string) {
    const actor = await this.getActor(currentUser);
    this.ensureAccess(actor, marketId);
    const backup = await this.prisma.marketBackup.findFirst({ where: { id: backupId, marketId } });
    if (!backup) throw new NotFoundException('بک‌آپ یافت نشد');
    return this.toPublic(backup);
  }

  async getDownload(currentUser: { id: string }, marketId: string, backupId: string, meta: RequestMeta) {
    const actor = await this.getActor(currentUser);
    this.ensureAccess(actor, marketId);
    const backup = await this.prisma.marketBackup.findFirst({ where: { id: backupId, marketId } });
    if (!backup) throw new NotFoundException('بک‌آپ یافت نشد');
    if (backup.status === 'EXPIRED') throw new GoneException('مهلتِ نگهداریِ این بک‌آپ تمام شده و فایلش پاک شده است');
    if (backup.status !== 'READY' || !backup.fileKey) {
      throw new ConflictException('این بک‌آپ هنوز آماده نیست یا ناموفق بوده است');
    }

    const path = this.pathFor(backup.fileKey);
    if (!existsSync(path)) throw new NotFoundException('فایلِ بک‌آپ روی سرور پیدا نشد');
    const { size } = await stat(path);

    await this.auditLog.record({
      action: 'UPDATE',
      entityType: 'MarketBackup',
      entityId: backup.id,
      marketId,
      userId: actor.id,
      newData: { event: 'downloaded' },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const day = backup.createdAt.toISOString().slice(0, 10);
    return {
      stream: createReadStream(path),
      size,
      filename: `market-${marketId}-${day}-${backup.kind.toLowerCase()}.ndjson.gz`,
    };
  }

  async getSettings(currentUser: { id: string }, marketId: string) {
    const actor = await this.getActor(currentUser);
    this.ensureAccess(actor, marketId);
    const market = await this.prisma.market.findUnique({ where: { id: marketId }, select: { autoBackupEnabled: true } });
    if (!market) throw new NotFoundException('مارکت یافت نشد');
    return {
      autoBackupEnabled: market.autoBackupEnabled,
      // فقط نمایشی: برای همهٔ مارکت‌ها یکی است و سرور با BACKUP_TIME تنظیم می‌کند.
      backupTime: this.backupTime,
      timezone: 'Asia/Kabul',
      autoRetentionDays: this.autoRetentionDays,
      manualRetentionDays: this.manualRetentionDays,
    };
  }

  async updateSettings(currentUser: { id: string }, marketId: string, autoBackupEnabled: boolean, meta: RequestMeta) {
    const actor = await this.getActor(currentUser);
    this.ensureAccess(actor, marketId);
    const before = await this.prisma.market.findUnique({ where: { id: marketId }, select: { autoBackupEnabled: true } });
    if (!before) throw new NotFoundException('مارکت یافت نشد');

    await this.prisma.market.update({ where: { id: marketId }, data: { autoBackupEnabled } });

    await this.auditLog.record({
      action: 'UPDATE',
      entityType: 'MarketBackupSettings',
      entityId: marketId,
      marketId,
      userId: actor.id,
      oldData: before,
      newData: { autoBackupEnabled },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return this.getSettings(currentUser, marketId);
  }

  // ---------------------------------------------------------------- scheduler

  // هر ۵ دقیقه نگاه می‌کند آیا ساعتِ بک‌آپِ امروز (BACKUP_TIME، وقتِ کابل، برای همهٔ مارکت‌ها
  // یکی) رسیده و کدام مارکتِ روشن‌شده امروز هنوز بک‌آپِ خودکار ندارد. چون «رسیده» یعنی «از ساعتِ
  // مقرر گذشته»، اگر سرور در آن ساعت خاموش بوده باشد، بعد از روشن شدن همان روز جبران می‌شود.
  // تکراری نمی‌سازد: اگر از لحظهٔ مقررِ امروز به بعد بک‌آپِ خودکاری (در صف، در حال اجرا یا
  // آماده) باشد، رد می‌شود.
  @Cron('*/5 * * * *', { name: 'market-due-backups' })
  async runDueBackups(now: Date = new Date()) {
    const scheduledAt = kabulTimeOnSameDay(now, this.backupTime);
    if (now < scheduledAt) return 0;

    const markets = await this.prisma.market.findMany({
      where: { autoBackupEnabled: true, isSetupComplete: true },
      select: { id: true },
    });
    let created = 0;
    for (const m of markets) {
      const exists = await this.prisma.marketBackup.count({
        where: {
          marketId: m.id,
          kind: 'AUTO',
          status: { in: ['PENDING', 'RUNNING', 'READY'] },
          createdAt: { gte: scheduledAt },
        },
      });
      if (exists > 0) continue;
      const backup = await this.prisma.marketBackup.create({ data: { marketId: m.id, kind: 'AUTO' } });
      this.enqueue(backup.id);
      created++;
    }
    if (created > 0) this.logger.log(`بک‌آپ خودکار: ${created} مارکت در صف قرار گرفت`);
    return created;
  }

  @Cron('15 * * * *', { name: 'market-backup-cleanup' })
  runCleanup() {
    this.queue = this.queue.then(() => this.cleanupExpired()).catch((e) => this.logger.error('cleanup failed', e));
  }

  async cleanupExpired() {
    const expired = await this.prisma.marketBackup.findMany({
      where: { status: 'READY', expiresAt: { lt: new Date() } },
      select: { id: true, fileKey: true },
    });
    for (const b of expired) {
      if (b.fileKey) await unlink(this.pathFor(b.fileKey)).catch(() => undefined);
      await this.prisma.marketBackup.update({ where: { id: b.id }, data: { status: 'EXPIRED' } });
    }
    if (expired.length > 0) this.logger.log(`${expired.length} بک‌آپِ منقضی پاک شد`);
  }

  // ---------------------------------------------------------------- execution

  enqueue(backupId: string): Promise<void> {
    this.queue = this.queue
      .then(() => this.execute(backupId))
      .catch((e) => this.logger.error(`backup ${backupId} crashed`, e instanceof Error ? e.stack : String(e)));
    return this.queue;
  }

  private async execute(backupId: string) {
    const backup = await this.prisma.marketBackup.findUnique({ where: { id: backupId } });
    if (!backup || backup.status !== 'PENDING') return;
    await this.prisma.marketBackup.update({ where: { id: backupId }, data: { status: 'RUNNING', startedAt: new Date() } });

    const marketId = backup.marketId;
    const fileKey = `${marketId}/${backupId}.ndjson.gz`;
    const finalPath = this.pathFor(fileKey);
    const tmpPath = `${finalPath}.tmp`;
    await mkdir(dirname(finalPath), { recursive: true });

    const hash = createHash('sha256');
    let size = 0;
    const gzip = createGzip({ level: 6 });
    const file = createWriteStream(tmpPath);
    gzip.on('data', (chunk: Buffer) => {
      hash.update(chunk);
      size += chunk.length;
    });
    gzip.pipe(file);
    const finished = new Promise<void>((res, rej) => {
      file.on('finish', res);
      file.on('error', rej);
      gzip.on('error', rej);
    });
    finished.catch(() => undefined);

    const write = async (obj: unknown) => {
      if (!gzip.write(JSON.stringify(obj, jsonReplacer) + '\n')) await once(gzip, 'drain');
    };

    try {
      const rowCounts: Record<string, number> = {};
      const schemaVersion = this.schemaVersion();

      // یک snapshotِ یکپارچه: همهٔ جدول‌ها در یک تراکنشِ RepeatableRead خوانده می‌شوند، پس اگر هم‌زمان
      // تراکنشی ثبت شود، مثلاً موجودیِ حساب با دفتر کل ناسازگار نمی‌شود.
      await this.prisma.$transaction(
        async (tx) => {
          await write({
            type: 'header',
            format: FORMAT,
            version: FORMAT_VERSION,
            marketId,
            backupId,
            createdAt: new Date().toISOString(),
            schemaVersion,
          });

          for (const entry of BACKUP_REGISTRY) {
            const delegate = (tx as any)[delegateName(entry.model)];
            const where = buildWhere(entry, marketId);
            const omit = entry.omit ? Object.fromEntries(entry.omit.map((f) => [f, true])) : undefined;
            let count = 0;

            if (this.modelsWithId.has(entry.model)) {
              let cursor: string | undefined;
              for (;;) {
                const rows: any[] = await delegate.findMany({
                  where,
                  orderBy: { id: 'asc' },
                  take: BATCH,
                  ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
                  ...(omit ? { omit } : {}),
                });
                for (const row of rows) await write({ type: 'row', model: entry.model, data: row });
                count += rows.length;
                if (rows.length < BATCH) break;
                cursor = rows[rows.length - 1].id;
              }
            } else {
              const rows: any[] = await delegate.findMany({ where, ...(omit ? { omit } : {}) });
              for (const row of rows) await write({ type: 'row', model: entry.model, data: row });
              count = rows.length;
            }
            rowCounts[entry.model] = count;
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: TX_TIMEOUT_MS, maxWait: 10_000 },
      );

      const totalRows = Object.values(rowCounts).reduce((a, b) => a + b, 0);
      await write({ type: 'footer', rowCounts, totalRows });
      gzip.end();
      await finished;
      await rename(tmpPath, finalPath);

      const retentionDays = backup.kind === 'AUTO' ? this.autoRetentionDays : this.manualRetentionDays;
      await this.prisma.marketBackup.update({
        where: { id: backupId },
        data: {
          status: 'READY',
          fileKey,
          sizeBytes: size,
          sha256: hash.digest('hex'),
          schemaVersion,
          rowCounts,
          totalRows,
          finishedAt: new Date(),
          expiresAt: new Date(Date.now() + retentionDays * DAY_MS),
        },
      });
      this.logger.log(`backup ${backupId} (market ${marketId}) READY: ${totalRows} rows, ${size} bytes`);
    } catch (e) {
      gzip.destroy();
      file.destroy();
      await unlink(tmpPath).catch(() => undefined);
      const message = e instanceof Error ? e.message : String(e);
      this.logger.error(`backup ${backupId} FAILED: ${message}`);
      await this.prisma.marketBackup.update({
        where: { id: backupId },
        data: { status: 'FAILED', error: message.slice(0, 1000), finishedAt: new Date() },
      });
    }
  }
}
