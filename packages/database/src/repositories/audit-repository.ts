import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { ok, err, Result } from '@ai-email-agent/utils';
import { getDb } from '../db.js';
import {
  auditLog,
  AuditLogEntry,
  NewAuditLogEntry,
  EventType,
  EventCategory,
  computeAuditChecksum,
} from '../schema/audit.js';

export interface AuditFilters {
  eventType?: EventType | EventType[];
  eventCategory?: EventCategory | EventCategory[];
  emailId?: string;
  actionId?: string;
  sagaId?: string;
  clientId?: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class AuditRepository {
  private db = getDb();

  async log(entry: NewAuditLogEntry): Promise<Result<AuditLogEntry, Error>> {
    try {
      const timestamp = entry.timestamp ?? new Date();
      const checksum = computeAuditChecksum({ ...entry, timestamp });

      const [created] = await this.db
        .insert(auditLog)
        .values({
          ...entry,
          timestamp,
          checksum,
        })
        .returning();

      if (!created) {
        return err(new Error('Failed to create audit log entry'));
      }
      return ok(created);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async logEmailEvent(
    eventType: EventType,
    emailId: string,
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<Result<AuditLogEntry, Error>> {
    return this.log({
      eventType,
      eventCategory: 'email',
      emailId,
      description,
      metadata,
    });
  }

  async logActionEvent(
    eventType: EventType,
    actionId: string,
    emailId: string,
    description: string,
    options?: {
      userId?: string;
      oldValue?: Record<string, unknown>;
      newValue?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<Result<AuditLogEntry, Error>> {
    return this.log({
      eventType,
      eventCategory: 'action',
      actionId,
      emailId,
      userId: options?.userId,
      description,
      oldValue: options?.oldValue,
      newValue: options?.newValue,
      metadata: options?.metadata,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    });
  }

  async logSagaEvent(
    eventType: EventType,
    sagaId: string,
    emailId: string,
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<Result<AuditLogEntry, Error>> {
    return this.log({
      eventType,
      eventCategory: 'saga',
      sagaId,
      emailId,
      description,
      metadata,
    });
  }

  async findMany(filters: AuditFilters = {}): Promise<Result<AuditLogEntry[], Error>> {
    try {
      const conditions = [];

      if (filters.eventType) {
        if (Array.isArray(filters.eventType)) {
          conditions.push(sql`${auditLog.eventType} = ANY(${filters.eventType})`);
        } else {
          conditions.push(eq(auditLog.eventType, filters.eventType));
        }
      }

      if (filters.eventCategory) {
        if (Array.isArray(filters.eventCategory)) {
          conditions.push(sql`${auditLog.eventCategory} = ANY(${filters.eventCategory})`);
        } else {
          conditions.push(eq(auditLog.eventCategory, filters.eventCategory));
        }
      }

      if (filters.emailId) {
        conditions.push(eq(auditLog.emailId, filters.emailId));
      }

      if (filters.actionId) {
        conditions.push(eq(auditLog.actionId, filters.actionId));
      }

      if (filters.sagaId) {
        conditions.push(eq(auditLog.sagaId, filters.sagaId));
      }

      if (filters.clientId) {
        conditions.push(eq(auditLog.clientId, filters.clientId));
      }

      if (filters.userId) {
        conditions.push(eq(auditLog.userId, filters.userId));
      }

      if (filters.startDate) {
        conditions.push(gte(auditLog.timestamp, filters.startDate));
      }

      if (filters.endDate) {
        conditions.push(lte(auditLog.timestamp, filters.endDate));
      }

      let query = this.db
        .select()
        .from(auditLog)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(auditLog.timestamp));

      if (filters.limit) {
        query = query.limit(filters.limit) as typeof query;
      }

      if (filters.offset) {
        query = query.offset(filters.offset) as typeof query;
      }

      const result = await query;
      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findByEmail(emailId: string, limit = 100): Promise<Result<AuditLogEntry[], Error>> {
    return this.findMany({ emailId, limit });
  }

  async findByAction(actionId: string, limit = 100): Promise<Result<AuditLogEntry[], Error>> {
    return this.findMany({ actionId, limit });
  }

  async findBySaga(sagaId: string, limit = 100): Promise<Result<AuditLogEntry[], Error>> {
    return this.findMany({ sagaId, limit });
  }

  async getRecentActivity(
    hours = 24,
    limit = 100
  ): Promise<Result<AuditLogEntry[], Error>> {
    const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.findMany({ startDate, limit });
  }

  async countByEventType(
    startDate?: Date,
    endDate?: Date
  ): Promise<Result<Record<string, number>, Error>> {
    try {
      const conditions = [];

      if (startDate) {
        conditions.push(gte(auditLog.timestamp, startDate));
      }

      if (endDate) {
        conditions.push(lte(auditLog.timestamp, endDate));
      }

      const result = await this.db
        .select({
          eventType: auditLog.eventType,
          count: sql<number>`count(*)::int`,
        })
        .from(auditLog)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .groupBy(auditLog.eventType);

      const counts: Record<string, number> = {};
      for (const row of result) {
        counts[row.eventType] = row.count;
      }
      return ok(counts);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // Verify integrity of audit entries
  async verifyIntegrity(id: bigint): Promise<Result<boolean, Error>> {
    try {
      const [entry] = await this.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.id, id))
        .limit(1);

      if (!entry) {
        return err(new Error(`Audit entry not found: ${id}`));
      }

      const expectedChecksum = computeAuditChecksum({
        timestamp: entry.timestamp,
        eventType: entry.eventType,
        eventCategory: entry.eventCategory,
        emailId: entry.emailId ?? undefined,
        actionId: entry.actionId ?? undefined,
        sagaId: entry.sagaId ?? undefined,
        clientId: entry.clientId ?? undefined,
        userId: entry.userId ?? undefined,
        description: entry.description,
        oldValue: entry.oldValue ?? undefined,
        newValue: entry.newValue ?? undefined,
        metadata: entry.metadata ?? undefined,
      });

      return ok(entry.checksum === expectedChecksum);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export const auditRepository = new AuditRepository();
