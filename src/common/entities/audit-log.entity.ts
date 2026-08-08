export class AuditLogEntity {
  id?: number;
  action?: string;
  entity?: string;
  entityId?: string | number;
  timestamp?: Date;
  userId?: number | null;
}
