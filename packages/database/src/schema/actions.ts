import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { emails } from './emails.js';
import { sagas } from './sagas.js';

// Action types
export const actionTypeValues = [
  'create_bill',
  'update_bill',
  'delete_bill',
  'create_invoice',
  'update_invoice',
  'record_payment',
  'schedule_payment',
  'execute_payment',
  'reconcile',
  'send_invoice',
] as const;
export type ActionType = (typeof actionTypeValues)[number];

// Target systems
export const targetSystemValues = ['quickbooks', 'billcom', 'internal'] as const;
export type TargetSystem = (typeof targetSystemValues)[number];

// Risk levels
export const riskLevelValues = ['low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = (typeof riskLevelValues)[number];

// Action status
export const actionStatusValues = [
  'pending',
  'approved',
  'rejected',
  'executing',
  'completed',
  'failed',
  'compensated',
] as const;
export type ActionStatus = (typeof actionStatusValues)[number];

// Result data structure
export interface ActionResult {
  success: boolean;
  externalId?: string;
  data?: Record<string, unknown>;
  error?: string;
}

export const actions = pgTable(
  'actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    emailId: uuid('email_id')
      .notNull()
      .references(() => emails.id),
    sagaId: uuid('saga_id').references(() => sagas.id),

    // Action definition
    actionType: varchar('action_type', { length: 50 }).notNull().$type<ActionType>(),
    targetSystem: varchar('target_system', { length: 50 }).notNull().$type<TargetSystem>(),
    parameters: jsonb('parameters').notNull().$type<Record<string, unknown>>(),

    // Risk assessment
    riskLevel: varchar('risk_level', { length: 20 }).notNull().$type<RiskLevel>(),
    riskReasons: text('risk_reasons')
      .array()
      .default(sql`'{}'::text[]`),
    requiresApproval: boolean('requires_approval').default(false),

    // Execution state
    status: varchar('status', { length: 50 }).notNull().default('pending').$type<ActionStatus>(),
    approvedBy: uuid('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectedBy: uuid('rejected_by'),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    executedAt: timestamp('executed_at', { withTimezone: true }),

    // Results
    result: jsonb('result').$type<ActionResult>(),
    externalId: varchar('external_id', { length: 255 }),
    error: text('error'),

    // Compensation
    isCompensated: boolean('is_compensated').default(false),
    compensatedAt: timestamp('compensated_at', { withTimezone: true }),
    compensationId: uuid('compensation_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    emailIdIdx: index('idx_actions_email_id').on(table.emailId),
    statusIdx: index('idx_actions_status').on(table.status),
    requiresApprovalIdx: index('idx_actions_requires_approval').on(table.requiresApproval),
    statusCheck: check(
      'valid_action_status',
      sql`${table.status} IN ('pending', 'approved', 'rejected', 'executing', 'completed', 'failed', 'compensated')`
    ),
  })
);

export type Action = typeof actions.$inferSelect;
export type NewAction = typeof actions.$inferInsert;
