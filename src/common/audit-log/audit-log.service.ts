import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

export interface RecordAuditParams {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  marketId?: string | null;
  userId?: string | null;
  oldData?: unknown;
  newData?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  // وقتی داخل یک $transaction صدا زده می‌شود (مثلاً هم‌زمان با ساخت/ویرایش Expense)،
  // همان tx پاس داده می‌شود تا نوشتنِ audit با تغییرِ مالی اتمیک بماند: یا هر دو
  // commit می‌شوند یا هیچ‌کدام — یک ردیفِ audit یتیم برای تراکنشی که rollback شده
  // نباید در جدول بماند.
  tx?: Prisma.TransactionClient;
}

// AuditLog فقط insert است؛ هیچ متدی برای update/delete اینجا عمداً وجود ندارد —
// اعتبارِ audit trail برای حسابرسی به همین تغییرناپذیری (immutability) وابسته است.
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(params: RecordAuditParams): Promise<void> {
    const { tx, ...data } = params;

    const createData: Prisma.AuditLogUncheckedCreateInput = {
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId ?? null,
      marketId: data.marketId ?? null,
      userId: data.userId ?? null,
      oldData: toJsonInput(data.oldData),
      newData: toJsonInput(data.newData),
      ipAddress: data.ip ?? null,
      userAgent: data.userAgent ?? null,
    };

    // داخل یک تراکنشِ مالی: خطا باید بالا برود تا کل تراکنش rollback شود (اتمیک بودن
    // مهم‌تر از تحمل خطاست). خارج از تراکنش (مثلاً LOGIN): خطای ثبتِ audit نباید کاربر
    // را از لاگین/عملیات اصلی بیندازد؛ فقط لاگ می‌شود.
    if (tx) {
      await tx.auditLog.create({ data: createData });
      return;
    }

    try {
      await this.prisma.auditLog.create({ data: createData });
    } catch (error) {
      this.logger.error(
        `Failed to write audit log (${data.action} ${data.entityType})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

function toJsonInput(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
