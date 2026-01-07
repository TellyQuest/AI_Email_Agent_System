import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { emails } from './emails.js';

// Saga status enum values
export const sagaStatusValues = [
  'pending',
  'running',
  'awaiting_approval',
  'completed',
  'failed',
  'compensating',
  'compensated',
] as const;
export type SagaStatus = (typeof sagaStatusValues)[number];

// Step status enum values
export const stepStatusValues = [
  'pending',
  'executing',
  'completed',
  'failed',
  'compensated',
] as const;
export type StepStatus = (typeof stepStatusValues)[number];

// Reversibility levels
export const reversibilityValues = [
  'full',
  'compensate',
  'soft_irreversible',
  'hard_irreversible',
] as const;
export type Reversibility = (typeof reversibilityValues)[number];

// Step definition structure
export interface SagaStepDefinition {
  id: string;
  name: string;
  actionType: string;
  targetSystem: string;
  parameters: Record<string, unknown>;
  compensation?: {
    actionType: string;
    parameters: Record<string, unknown>;
  };
  reversibility: Reversibility;
  requiresApproval: boolean;
  status: StepStatus;
  result?: {
    success: boolean;
    externalId?: string;
    data?: Record<string, unknown>;
    error?: string;
  };
  executedAt?: string;
  compensatedAt?: string;
}

export const sagas = pgTable(
  'sagas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    emailId: uuid('email_id')
      .notNull()
      .references(() => emails.id),

    status: varchar('status', { length: 50 }).notNull().default('pending').$type<SagaStatus>(),
    currentStep: integer('current_step').default(0),
    totalSteps: integer('total_steps').notNull(),

    steps: jsonb('steps').notNull().$type<SagaStepDefinition[]>(),

    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    compensatedAt: timestamp('compensated_at', { withTimezone: true }),

    error: text('error'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    statusCheck: check(
      'valid_saga_status',
      sql`${table.status} IN ('pending', 'running', 'awaiting_approval', 'completed', 'failed', 'compensating', 'compensated')`
    ),
  })
);

export type Saga = typeof sagas.$inferSelect;
export type NewSaga = typeof sagas.$inferInsert;
