import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../schema/index.js';

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

let testDb: TestDb | undefined;
let queryClient: ReturnType<typeof postgres> | undefined;

/**
 * Get or create a test database connection
 */
export function getTestDb(): TestDb {
  if (testDb) {
    return testDb;
  }

  const databaseUrl = process.env['TEST_DATABASE_URL'] || process.env['DATABASE_URL'];

  if (!databaseUrl) {
    throw new Error('TEST_DATABASE_URL or DATABASE_URL environment variable is required for integration tests');
  }

  queryClient = postgres(databaseUrl, {
    max: 5,
    idle_timeout: 10,
    connect_timeout: 10,
  });

  testDb = drizzle(queryClient, { schema });
  return testDb;
}

/**
 * Run migrations on the test database
 */
export async function runMigrations(): Promise<void> {
  const db = getTestDb();
  // Use drizzle push equivalent - create tables directly from schema
  // For tests, we'll use a simpler approach with raw SQL
}

/**
 * Clean all data from the test database
 */
export async function cleanDatabase(): Promise<void> {
  const db = getTestDb();

  // Delete in reverse order of foreign key dependencies
  await db.delete(schema.auditLog);
  await db.delete(schema.attachments);
  await db.delete(schema.actions);
  await db.delete(schema.sagas);
  await db.delete(schema.emails);
  await db.delete(schema.clientEmailMappings);
  await db.delete(schema.clients);
}

/**
 * Close the test database connection
 */
export async function closeTestDb(): Promise<void> {
  if (queryClient) {
    await queryClient.end();
    queryClient = undefined;
    testDb = undefined;
  }
}

/**
 * Create test database tables using raw SQL
 * This is a simpler alternative to running migrations for tests
 */
export async function createTestTables(): Promise<void> {
  const db = getTestDb();

  // Create tables in order of dependencies
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS clients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      display_name VARCHAR(255),
      quickbooks_id VARCHAR(100),
      billcom_id VARCHAR(100),
      email_domains TEXT[] DEFAULT '{}',
      known_emails TEXT[] DEFAULT '{}',
      keywords TEXT[] DEFAULT '{}',
      default_expense_account VARCHAR(100),
      approval_threshold DECIMAL(12, 2) DEFAULT 5000.00,
      auto_approve_vendors TEXT[] DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      is_active BOOLEAN DEFAULT true
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS client_email_mappings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email_pattern VARCHAR(255) NOT NULL,
      client_id UUID NOT NULL REFERENCES clients(id),
      pattern_type VARCHAR(20) NOT NULL,
      confidence DECIMAL(3, 2) DEFAULT 1.0,
      source VARCHAR(50) NOT NULL,
      created_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(email_pattern, pattern_type)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS emails (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id VARCHAR(255) UNIQUE NOT NULL,
      conversation_id VARCHAR(255),
      subject TEXT NOT NULL,
      sender_email VARCHAR(255) NOT NULL,
      sender_name VARCHAR(255),
      recipient_email VARCHAR(255) NOT NULL,
      received_at TIMESTAMPTZ NOT NULL,
      body_text TEXT,
      body_html TEXT,
      raw_headers JSONB,
      has_attachments BOOLEAN DEFAULT false,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      classification JSONB,
      client_id UUID REFERENCES clients(id),
      match_method VARCHAR(50),
      match_confidence DECIMAL(3, 2),
      extracted_data JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      processed_at TIMESTAMPTZ
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sagas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email_id UUID NOT NULL REFERENCES emails(id),
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      current_step INTEGER DEFAULT 0,
      total_steps INTEGER NOT NULL,
      steps JSONB NOT NULL,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      failed_at TIMESTAMPTZ,
      compensated_at TIMESTAMPTZ,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS actions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email_id UUID NOT NULL REFERENCES emails(id),
      saga_id UUID REFERENCES sagas(id),
      action_type VARCHAR(50) NOT NULL,
      target_system VARCHAR(50) NOT NULL,
      parameters JSONB NOT NULL,
      risk_level VARCHAR(20) NOT NULL,
      risk_reasons TEXT[] DEFAULT '{}',
      requires_approval BOOLEAN DEFAULT false,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      approved_by UUID,
      approved_at TIMESTAMPTZ,
      rejected_by UUID,
      rejected_at TIMESTAMPTZ,
      rejection_reason TEXT,
      executed_at TIMESTAMPTZ,
      result JSONB,
      external_id VARCHAR(255),
      error TEXT,
      is_compensated BOOLEAN DEFAULT false,
      compensated_at TIMESTAMPTZ,
      compensation_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email_id UUID NOT NULL REFERENCES emails(id),
      filename VARCHAR(255) NOT NULL,
      content_type VARCHAR(100) NOT NULL,
      size INTEGER NOT NULL,
      storage_path VARCHAR(500) NOT NULL,
      storage_bucket VARCHAR(100) NOT NULL,
      content_hash VARCHAR(64),
      extraction_status VARCHAR(50) DEFAULT 'pending',
      extracted_text TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      id BIGSERIAL PRIMARY KEY,
      timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      event_category VARCHAR(50) NOT NULL,
      email_id UUID,
      action_id UUID,
      saga_id UUID,
      client_id UUID,
      user_id UUID,
      description TEXT NOT NULL,
      old_value JSONB,
      new_value JSONB,
      metadata JSONB,
      ip_address INET,
      user_agent TEXT,
      checksum VARCHAR(64) NOT NULL
    )
  `);
}

/**
 * Drop all test tables
 */
export async function dropTestTables(): Promise<void> {
  const db = getTestDb();

  await db.execute(sql`DROP TABLE IF EXISTS audit_log CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS attachments CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS actions CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS sagas CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS emails CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS client_email_mappings CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS clients CASCADE`);
}
