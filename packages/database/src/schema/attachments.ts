import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { emails } from './emails.js';

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    emailId: uuid('email_id')
      .notNull()
      .references(() => emails.id),

    // File info
    filename: varchar('filename', { length: 255 }).notNull(),
    contentType: varchar('content_type', { length: 100 }).notNull(),
    size: integer('size').notNull(),

    // Storage location
    storagePath: varchar('storage_path', { length: 500 }).notNull(),
    storageBucket: varchar('storage_bucket', { length: 100 }).notNull(),

    // Content hash for deduplication
    contentHash: varchar('content_hash', { length: 64 }),

    // Extraction status
    extractionStatus: varchar('extraction_status', { length: 50 }).default('pending'),
    extractedText: text('extracted_text'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    emailIdIdx: index('idx_attachments_email_id').on(table.emailId),
    contentHashIdx: index('idx_attachments_content_hash').on(table.contentHash),
  })
);

export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
