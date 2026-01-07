import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  decimal,
  jsonb,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { clients } from './clients.js';

// Email status enum values
export const emailStatusValues = [
  'pending',
  'processing',
  'classified',
  'matched',
  'extracted',
  'planned',
  'completed',
  'failed',
  'archived',
] as const;
export type EmailStatus = (typeof emailStatusValues)[number];

// Email type enum values
export const emailTypeValues = [
  'invoice',
  'receipt',
  'payment_notice',
  'bank_notice',
  'inquiry',
  'irrelevant',
] as const;
export type EmailType = (typeof emailTypeValues)[number];

// Urgency level enum values
export const urgencyLevelValues = ['low', 'medium', 'high', 'critical'] as const;
export type UrgencyLevel = (typeof urgencyLevelValues)[number];

// Match method enum values
export const matchMethodValues = [
  'explicit',
  'domain',
  'vendor',
  'content',
  'thread',
  'unmatched',
] as const;
export type MatchMethod = (typeof matchMethodValues)[number];

// Classification JSON structure
export interface ClassificationData {
  emailType: EmailType;
  intent: string;
  urgency: UrgencyLevel;
  confidence: number;
  reasoning: string;
}

// Extracted data JSON structure
export interface ExtractedDataField<T> {
  value: T | null;
  confidence: number;
  source: 'subject' | 'body' | 'attachment' | 'inferred';
}

export interface LineItem {
  description: string;
  amount: string;
  quantity?: number;
}

export interface ExtractedData {
  vendorName: ExtractedDataField<string>;
  amount: ExtractedDataField<string>;
  currency: ExtractedDataField<string>;
  dueDate: ExtractedDataField<string>;
  invoiceNumber: ExtractedDataField<string>;
  description: ExtractedDataField<string>;
  lineItems: LineItem[];
  overallConfidence: number;
  warnings: string[];
}

export const emails = pgTable(
  'emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: varchar('message_id', { length: 255 }).unique().notNull(),
    conversationId: varchar('conversation_id', { length: 255 }),
    subject: text('subject').notNull(),
    senderEmail: varchar('sender_email', { length: 255 }).notNull(),
    senderName: varchar('sender_name', { length: 255 }),
    recipientEmail: varchar('recipient_email', { length: 255 }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    bodyText: text('body_text'),
    bodyHtml: text('body_html'),
    rawHeaders: jsonb('raw_headers').$type<Record<string, string>>(),
    hasAttachments: boolean('has_attachments').default(false),

    // Processing state
    status: varchar('status', { length: 50 }).notNull().default('pending'),
    classification: jsonb('classification').$type<ClassificationData>(),
    clientId: uuid('client_id').references(() => clients.id),
    matchMethod: varchar('match_method', { length: 50 }).$type<MatchMethod>(),
    matchConfidence: decimal('match_confidence', { precision: 3, scale: 2 }),
    extractedData: jsonb('extracted_data').$type<ExtractedData>(),

    // Metadata
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => ({
    statusIdx: index('idx_emails_status').on(table.status),
    clientIdIdx: index('idx_emails_client_id').on(table.clientId),
    receivedAtIdx: index('idx_emails_received_at').on(table.receivedAt),
    senderEmailIdx: index('idx_emails_sender_email').on(table.senderEmail),
    statusCheck: check(
      'valid_status',
      sql`${table.status} IN ('pending', 'processing', 'classified', 'matched', 'extracted', 'planned', 'completed', 'failed', 'archived')`
    ),
  })
);

export type Email = typeof emails.$inferSelect;
export type NewEmail = typeof emails.$inferInsert;
