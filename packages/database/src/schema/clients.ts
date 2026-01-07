import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  decimal,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    displayName: varchar('display_name', { length: 255 }),
    quickbooksId: varchar('quickbooks_id', { length: 100 }),
    billcomId: varchar('billcom_id', { length: 100 }),

    // Matching helpers - using TEXT[] via sql
    emailDomains: text('email_domains')
      .array()
      .default(sql`'{}'::text[]`),
    knownEmails: text('known_emails')
      .array()
      .default(sql`'{}'::text[]`),
    keywords: text('keywords')
      .array()
      .default(sql`'{}'::text[]`),

    // Settings
    defaultExpenseAccount: varchar('default_expense_account', { length: 100 }),
    approvalThreshold: decimal('approval_threshold', { precision: 12, scale: 2 }).default('5000.00'),
    autoApproveVendors: text('auto_approve_vendors')
      .array()
      .default(sql`'{}'::text[]`),

    // Metadata
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    isActive: boolean('is_active').default(true),
  },
  (table) => ({
    quickbooksIdIdx: index('idx_clients_quickbooks_id').on(table.quickbooksId),
    billcomIdIdx: index('idx_clients_billcom_id').on(table.billcomId),
  })
);

// Pattern type for email mappings
export const patternTypeValues = ['exact', 'domain', 'regex'] as const;
export type PatternType = (typeof patternTypeValues)[number];

// Source of mapping
export const mappingSourceValues = ['manual', 'learned', 'imported'] as const;
export type MappingSource = (typeof mappingSourceValues)[number];

export const clientEmailMappings = pgTable(
  'client_email_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    emailPattern: varchar('email_pattern', { length: 255 }).notNull(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    patternType: varchar('pattern_type', { length: 20 }).notNull().$type<PatternType>(),
    confidence: decimal('confidence', { precision: 3, scale: 2 }).default('1.0'),
    source: varchar('source', { length: 50 }).notNull().$type<MappingSource>(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniquePattern: unique('unique_email_pattern').on(table.emailPattern, table.patternType),
  })
);

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type ClientEmailMapping = typeof clientEmailMappings.$inferSelect;
export type NewClientEmailMapping = typeof clientEmailMappings.$inferInsert;
