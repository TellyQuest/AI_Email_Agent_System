import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  bigserial,
  inet,
  index,
} from 'drizzle-orm/pg-core';
import { createHash } from 'crypto';

// Event categories
export const eventCategoryValues = [
  'email',
  'classification',
  'extraction',
  'matching',
  'action',
  'saga',
  'approval',
  'system',
  'auth',
] as const;
export type EventCategory = (typeof eventCategoryValues)[number];

// Event types
export const eventTypeValues = [
  // Email events
  'email.received',
  'email.classified',
  'email.matched',
  'email.extracted',
  'email.archived',
  'email.failed',

  // Action events
  'action.created',
  'action.approved',
  'action.rejected',
  'action.executed',
  'action.failed',
  'action.compensated',

  // Saga events
  'saga.started',
  'saga.step_completed',
  'saga.step_failed',
  'saga.completed',
  'saga.failed',
  'saga.compensating',
  'saga.compensated',

  // System events
  'system.startup',
  'system.shutdown',
  'system.error',
  'system.config_changed',

  // Auth events
  'auth.login',
  'auth.logout',
  'auth.failed',
] as const;
export type EventType = (typeof eventTypeValues)[number];

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),

    // What happened
    eventType: varchar('event_type', { length: 100 }).notNull().$type<EventType>(),
    eventCategory: varchar('event_category', { length: 50 }).notNull().$type<EventCategory>(),

    // Context
    emailId: uuid('email_id'),
    actionId: uuid('action_id'),
    sagaId: uuid('saga_id'),
    clientId: uuid('client_id'),
    userId: uuid('user_id'),

    // Details
    description: text('description').notNull(),
    oldValue: jsonb('old_value').$type<Record<string, unknown>>(),
    newValue: jsonb('new_value').$type<Record<string, unknown>>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    // Security
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),

    // Integrity
    checksum: varchar('checksum', { length: 64 }).notNull(),
  },
  (table) => ({
    timestampIdx: index('idx_audit_log_timestamp').on(table.timestamp),
    emailIdIdx: index('idx_audit_log_email_id').on(table.emailId),
    eventTypeIdx: index('idx_audit_log_event_type').on(table.eventType),
    eventCategoryIdx: index('idx_audit_log_event_category').on(table.eventCategory),
  })
);

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = Omit<typeof auditLog.$inferInsert, 'id' | 'checksum'>;

// Helper to compute checksum for audit entries
export function computeAuditChecksum(entry: Omit<NewAuditLogEntry, 'id'>): string {
  const data = JSON.stringify({
    timestamp: entry.timestamp?.toISOString(),
    eventType: entry.eventType,
    eventCategory: entry.eventCategory,
    emailId: entry.emailId,
    actionId: entry.actionId,
    sagaId: entry.sagaId,
    clientId: entry.clientId,
    userId: entry.userId,
    description: entry.description,
    oldValue: entry.oldValue,
    newValue: entry.newValue,
    metadata: entry.metadata,
  });
  return createHash('sha256').update(data).digest('hex');
}
