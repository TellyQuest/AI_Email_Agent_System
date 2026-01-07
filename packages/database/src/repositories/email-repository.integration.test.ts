import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  getTestDb,
  createTestTables,
  dropTestTables,
  cleanDatabase,
  closeTestDb,
  type TestDb,
} from '../test/setup.js';
import {
  createTestEmail,
  createClassifiedEmail,
  createExtractedEmail,
  generateUniqueEmail,
  createTestClient,
} from '../test/fixtures.js';
import { emails, clients } from '../schema/index.js';

describe('EmailRepository Integration Tests', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = getTestDb();
    await dropTestTables();
    await createTestTables();
  });

  afterAll(async () => {
    await dropTestTables();
    await closeTestDb();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  describe('create', () => {
    it('creates a new email', async () => {
      const emailData = generateUniqueEmail();

      const [created] = await db.insert(emails).values(emailData).returning();

      expect(created).toBeDefined();
      expect(created?.id).toBeDefined();
      expect(created?.messageId).toBe(emailData.messageId);
      expect(created?.subject).toBe(emailData.subject);
      expect(created?.status).toBe('pending');
    });

    it('creates email with classification data', async () => {
      const emailData = createClassifiedEmail();

      const [created] = await db.insert(emails).values(emailData).returning();

      expect(created).toBeDefined();
      expect(created?.classification).not.toBeNull();
      expect(created?.classification?.emailType).toBe('invoice');
      expect(created?.classification?.confidence).toBe(0.95);
    });

    it('creates email with extracted data', async () => {
      const emailData = createExtractedEmail();

      const [created] = await db.insert(emails).values(emailData).returning();

      expect(created).toBeDefined();
      expect(created?.extractedData).not.toBeNull();
      expect(created?.extractedData?.vendorName.value).toBe('Test Vendor Inc');
      expect(created?.extractedData?.amount.value).toBe('1500.00');
    });

    it('enforces unique message_id constraint', async () => {
      const emailData = generateUniqueEmail();

      await db.insert(emails).values(emailData);

      await expect(
        db.insert(emails).values(emailData)
      ).rejects.toThrow();
    });
  });

  describe('findById', () => {
    it('finds email by id', async () => {
      const emailData = generateUniqueEmail();
      const [created] = await db.insert(emails).values(emailData).returning();

      const [found] = await db
        .select()
        .from(emails)
        .where(eq(emails.id, created!.id))
        .limit(1);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created!.id);
      expect(found?.messageId).toBe(emailData.messageId);
    });

    it('returns empty for non-existent id', async () => {
      const [found] = await db
        .select()
        .from(emails)
        .where(eq(emails.id, '00000000-0000-0000-0000-000000000000'))
        .limit(1);

      expect(found).toBeUndefined();
    });
  });

  describe('findByMessageId', () => {
    it('finds email by messageId', async () => {
      const emailData = generateUniqueEmail();
      await db.insert(emails).values(emailData);

      const [found] = await db
        .select()
        .from(emails)
        .where(eq(emails.messageId, emailData.messageId))
        .limit(1);

      expect(found).toBeDefined();
      expect(found?.messageId).toBe(emailData.messageId);
    });
  });

  describe('findMany with filters', () => {
    it('filters by status', async () => {
      // Create emails with different statuses
      await db.insert(emails).values([
        generateUniqueEmail({ status: 'pending' }),
        generateUniqueEmail({ status: 'pending' }),
        generateUniqueEmail({ status: 'completed' }),
      ]);

      const pendingEmails = await db
        .select()
        .from(emails)
        .where(eq(emails.status, 'pending'));

      const completedEmails = await db
        .select()
        .from(emails)
        .where(eq(emails.status, 'completed'));

      expect(pendingEmails).toHaveLength(2);
      expect(completedEmails).toHaveLength(1);
    });

    it('filters by clientId', async () => {
      // Create a client first
      const [client] = await db.insert(clients).values(createTestClient()).returning();

      // Create emails with and without client
      await db.insert(emails).values([
        generateUniqueEmail({ clientId: client!.id }),
        generateUniqueEmail({ clientId: client!.id }),
        generateUniqueEmail({ clientId: null }),
      ]);

      const clientEmails = await db
        .select()
        .from(emails)
        .where(eq(emails.clientId, client!.id));

      expect(clientEmails).toHaveLength(2);
    });

    it('filters by senderEmail', async () => {
      await db.insert(emails).values([
        generateUniqueEmail({ senderEmail: 'vendor1@example.com' }),
        generateUniqueEmail({ senderEmail: 'vendor1@example.com' }),
        generateUniqueEmail({ senderEmail: 'vendor2@example.com' }),
      ]);

      const vendor1Emails = await db
        .select()
        .from(emails)
        .where(eq(emails.senderEmail, 'vendor1@example.com'));

      expect(vendor1Emails).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('updates email status', async () => {
      const emailData = generateUniqueEmail({ status: 'pending' });
      const [created] = await db.insert(emails).values(emailData).returning();

      const [updated] = await db
        .update(emails)
        .set({ status: 'processing', updatedAt: new Date() })
        .where(eq(emails.id, created!.id))
        .returning();

      expect(updated?.status).toBe('processing');
    });

    it('updates email with classification', async () => {
      const emailData = generateUniqueEmail();
      const [created] = await db.insert(emails).values(emailData).returning();

      const classification = {
        emailType: 'invoice' as const,
        intent: 'Payment request',
        urgency: 'high' as const,
        confidence: 0.92,
        reasoning: 'Updated classification',
      };

      const [updated] = await db
        .update(emails)
        .set({
          status: 'classified',
          classification,
          updatedAt: new Date(),
        })
        .where(eq(emails.id, created!.id))
        .returning();

      expect(updated?.status).toBe('classified');
      expect(updated?.classification?.emailType).toBe('invoice');
      expect(updated?.classification?.urgency).toBe('high');
    });

    it('updates email with extracted data', async () => {
      const emailData = createClassifiedEmail();
      const [created] = await db.insert(emails).values(emailData).returning();

      const extractedData = {
        vendorName: { value: 'Updated Vendor', confidence: 0.98, source: 'body' as const },
        amount: { value: '2500.00', confidence: 0.99, source: 'body' as const },
        currency: { value: 'USD', confidence: 1.0, source: 'inferred' as const },
        dueDate: { value: '2024-03-01', confidence: 0.9, source: 'body' as const },
        invoiceNumber: { value: 'INV-002', confidence: 0.95, source: 'subject' as const },
        description: { value: 'Updated services', confidence: 0.85, source: 'body' as const },
        lineItems: [],
        overallConfidence: 0.94,
        warnings: [],
      };

      const [updated] = await db
        .update(emails)
        .set({
          status: 'extracted',
          extractedData,
          updatedAt: new Date(),
        })
        .where(eq(emails.id, created!.id))
        .returning();

      expect(updated?.status).toBe('extracted');
      expect(updated?.extractedData?.vendorName.value).toBe('Updated Vendor');
      expect(updated?.extractedData?.amount.value).toBe('2500.00');
    });
  });

  describe('client association', () => {
    it('associates email with client', async () => {
      const [client] = await db.insert(clients).values(createTestClient()).returning();
      const emailData = generateUniqueEmail();
      const [created] = await db.insert(emails).values(emailData).returning();

      const [updated] = await db
        .update(emails)
        .set({
          clientId: client!.id,
          matchMethod: 'domain',
          matchConfidence: '0.95',
          updatedAt: new Date(),
        })
        .where(eq(emails.id, created!.id))
        .returning();

      expect(updated?.clientId).toBe(client!.id);
      expect(updated?.matchMethod).toBe('domain');
    });

    it('clears client association', async () => {
      const [client] = await db.insert(clients).values(createTestClient()).returning();
      const emailData = generateUniqueEmail({ clientId: client!.id });
      const [created] = await db.insert(emails).values(emailData).returning();

      const [updated] = await db
        .update(emails)
        .set({
          clientId: null,
          matchMethod: null,
          matchConfidence: null,
          updatedAt: new Date(),
        })
        .where(eq(emails.id, created!.id))
        .returning();

      expect(updated?.clientId).toBeNull();
    });
  });

  describe('bulk operations', () => {
    it('creates multiple emails', async () => {
      const emailsToCreate = [
        generateUniqueEmail({ subject: 'Email 1' }),
        generateUniqueEmail({ subject: 'Email 2' }),
        generateUniqueEmail({ subject: 'Email 3' }),
      ];

      const created = await db.insert(emails).values(emailsToCreate).returning();

      expect(created).toHaveLength(3);
    });

    it('counts emails by status', async () => {
      await db.insert(emails).values([
        generateUniqueEmail({ status: 'pending' }),
        generateUniqueEmail({ status: 'pending' }),
        generateUniqueEmail({ status: 'processing' }),
        generateUniqueEmail({ status: 'completed' }),
        generateUniqueEmail({ status: 'completed' }),
        generateUniqueEmail({ status: 'completed' }),
      ]);

      const allEmails = await db.select().from(emails);
      const pendingCount = allEmails.filter((e) => e.status === 'pending').length;
      const completedCount = allEmails.filter((e) => e.status === 'completed').length;

      expect(pendingCount).toBe(2);
      expect(completedCount).toBe(3);
    });
  });
});
