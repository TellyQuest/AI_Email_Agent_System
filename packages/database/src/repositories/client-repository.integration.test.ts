import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, ilike } from 'drizzle-orm';
import {
  getTestDb,
  createTestTables,
  dropTestTables,
  cleanDatabase,
  closeTestDb,
  type TestDb,
} from '../test/setup.js';
import { createTestClient } from '../test/fixtures.js';
import { clients, clientEmailMappings } from '../schema/index.js';

describe('ClientRepository Integration Tests', () => {
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
    it('creates a new client with defaults', async () => {
      const clientData = createTestClient();

      const [created] = await db.insert(clients).values(clientData).returning();

      expect(created).toBeDefined();
      expect(created?.id).toBeDefined();
      expect(created?.name).toBe(clientData.name);
      expect(created?.isActive).toBe(true);
    });

    it('creates client with custom approval threshold', async () => {
      const clientData = createTestClient({
        approvalThreshold: '10000.00',
      });

      const [created] = await db.insert(clients).values(clientData).returning();

      expect(created?.approvalThreshold).toBe('10000.00');
    });

    it('creates client with email domains', async () => {
      const clientData = createTestClient({
        emailDomains: ['acme.com', 'acme.co.uk'],
      });

      const [created] = await db.insert(clients).values(clientData).returning();

      expect(created?.emailDomains).toContain('acme.com');
      expect(created?.emailDomains).toContain('acme.co.uk');
    });

    it('creates client with auto-approve vendors', async () => {
      const clientData = createTestClient({
        autoApproveVendors: ['trusted-vendor-1', 'trusted-vendor-2'],
      });

      const [created] = await db.insert(clients).values(clientData).returning();

      expect(created?.autoApproveVendors).toHaveLength(2);
    });
  });

  describe('findById', () => {
    it('finds client by id', async () => {
      const clientData = createTestClient();
      const [created] = await db.insert(clients).values(clientData).returning();

      const [found] = await db
        .select()
        .from(clients)
        .where(eq(clients.id, created!.id))
        .limit(1);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created!.id);
      expect(found?.name).toBe(clientData.name);
    });

    it('returns undefined for non-existent id', async () => {
      const [found] = await db
        .select()
        .from(clients)
        .where(eq(clients.id, '00000000-0000-0000-0000-000000000000'))
        .limit(1);

      expect(found).toBeUndefined();
    });
  });

  describe('findByQuickbooksId', () => {
    it('finds client by quickbooks id', async () => {
      const clientData = createTestClient({
        quickbooksId: 'qb-12345',
      });
      await db.insert(clients).values(clientData);

      const [found] = await db
        .select()
        .from(clients)
        .where(eq(clients.quickbooksId, 'qb-12345'))
        .limit(1);

      expect(found).toBeDefined();
      expect(found?.quickbooksId).toBe('qb-12345');
    });
  });

  describe('findMany with filters', () => {
    beforeEach(async () => {
      await db.insert(clients).values([
        createTestClient({ name: 'Acme Corp', isActive: true }),
        createTestClient({ name: 'Beta Inc', isActive: true }),
        createTestClient({ name: 'Acme Ltd', isActive: false }),
        createTestClient({ name: 'Gamma LLC', isActive: true }),
      ]);
    });

    it('filters by isActive', async () => {
      const activeClients = await db
        .select()
        .from(clients)
        .where(eq(clients.isActive, true));

      const inactiveClients = await db
        .select()
        .from(clients)
        .where(eq(clients.isActive, false));

      expect(activeClients).toHaveLength(3);
      expect(inactiveClients).toHaveLength(1);
    });

    it('searches by name (case insensitive)', async () => {
      const acmeClients = await db
        .select()
        .from(clients)
        .where(ilike(clients.name, '%acme%'));

      expect(acmeClients).toHaveLength(2);
    });

    it('limits results', async () => {
      const limited = await db.select().from(clients).limit(2);

      expect(limited).toHaveLength(2);
    });

    it('offsets results', async () => {
      const all = await db.select().from(clients);
      const offset = await db.select().from(clients).offset(2);

      expect(offset).toHaveLength(all.length - 2);
    });
  });

  describe('update', () => {
    it('updates client name', async () => {
      const [client] = await db.insert(clients).values(createTestClient()).returning();

      const [updated] = await db
        .update(clients)
        .set({ name: 'Updated Name', updatedAt: new Date() })
        .where(eq(clients.id, client!.id))
        .returning();

      expect(updated?.name).toBe('Updated Name');
    });

    it('updates client approval threshold', async () => {
      const [client] = await db.insert(clients).values(createTestClient()).returning();

      const [updated] = await db
        .update(clients)
        .set({ approvalThreshold: '25000.00', updatedAt: new Date() })
        .where(eq(clients.id, client!.id))
        .returning();

      expect(updated?.approvalThreshold).toBe('25000.00');
    });

    it('updates client email domains', async () => {
      const [client] = await db.insert(clients).values(createTestClient()).returning();

      const [updated] = await db
        .update(clients)
        .set({
          emailDomains: ['newdomain.com', 'another.com'],
          updatedAt: new Date(),
        })
        .where(eq(clients.id, client!.id))
        .returning();

      expect(updated?.emailDomains).toContain('newdomain.com');
      expect(updated?.emailDomains).toContain('another.com');
    });

    it('deactivates client', async () => {
      const [client] = await db.insert(clients).values(createTestClient()).returning();

      const [updated] = await db
        .update(clients)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(clients.id, client!.id))
        .returning();

      expect(updated?.isActive).toBe(false);
    });
  });

  describe('email mappings', () => {
    it('creates explicit email mapping', async () => {
      const [client] = await db.insert(clients).values(createTestClient()).returning();

      const [mapping] = await db
        .insert(clientEmailMappings)
        .values({
          emailPattern: 'billing@vendor.com',
          clientId: client!.id,
          patternType: 'exact',
          confidence: '1.0',
          source: 'manual',
        })
        .returning();

      expect(mapping).toBeDefined();
      expect(mapping?.emailPattern).toBe('billing@vendor.com');
      expect(mapping?.patternType).toBe('exact');
    });

    it('creates domain mapping', async () => {
      const [client] = await db.insert(clients).values(createTestClient()).returning();

      const [mapping] = await db
        .insert(clientEmailMappings)
        .values({
          emailPattern: 'vendor.com',
          clientId: client!.id,
          patternType: 'domain',
          confidence: '0.9',
          source: 'manual',
        })
        .returning();

      expect(mapping?.patternType).toBe('domain');
      expect(mapping?.confidence).toBe('0.90');
    });

    it('finds mappings for client', async () => {
      const [client] = await db.insert(clients).values(createTestClient()).returning();

      await db.insert(clientEmailMappings).values([
        {
          emailPattern: 'billing@vendor1.com',
          clientId: client!.id,
          patternType: 'exact',
          confidence: '1.0',
          source: 'manual',
        },
        {
          emailPattern: 'vendor2.com',
          clientId: client!.id,
          patternType: 'domain',
          confidence: '0.9',
          source: 'learned',
        },
      ]);

      const mappings = await db
        .select()
        .from(clientEmailMappings)
        .where(eq(clientEmailMappings.clientId, client!.id));

      expect(mappings).toHaveLength(2);
    });

    it('enforces unique email pattern per type', async () => {
      const [client] = await db.insert(clients).values(createTestClient()).returning();

      await db.insert(clientEmailMappings).values({
        emailPattern: 'test@vendor.com',
        clientId: client!.id,
        patternType: 'exact',
        confidence: '1.0',
        source: 'manual',
      });

      await expect(
        db.insert(clientEmailMappings).values({
          emailPattern: 'test@vendor.com',
          clientId: client!.id,
          patternType: 'exact',
          confidence: '0.9',
          source: 'learned',
        })
      ).rejects.toThrow();
    });

    it('allows same pattern with different type', async () => {
      const [client] = await db.insert(clients).values(createTestClient()).returning();

      await db.insert(clientEmailMappings).values({
        emailPattern: 'vendor.com',
        clientId: client!.id,
        patternType: 'exact',
        confidence: '1.0',
        source: 'manual',
      });

      const [secondMapping] = await db
        .insert(clientEmailMappings)
        .values({
          emailPattern: 'vendor.com',
          clientId: client!.id,
          patternType: 'domain',
          confidence: '0.9',
          source: 'manual',
        })
        .returning();

      expect(secondMapping).toBeDefined();
    });

    it('deletes email mapping', async () => {
      const [client] = await db.insert(clients).values(createTestClient()).returning();
      const [mapping] = await db
        .insert(clientEmailMappings)
        .values({
          emailPattern: 'test@vendor.com',
          clientId: client!.id,
          patternType: 'exact',
          confidence: '1.0',
          source: 'manual',
        })
        .returning();

      await db.delete(clientEmailMappings).where(eq(clientEmailMappings.id, mapping!.id));

      const [found] = await db
        .select()
        .from(clientEmailMappings)
        .where(eq(clientEmailMappings.id, mapping!.id));

      expect(found).toBeUndefined();
    });

    it('cascades delete when client is deleted', async () => {
      const [client] = await db.insert(clients).values(createTestClient()).returning();
      await db.insert(clientEmailMappings).values({
        emailPattern: 'test@vendor.com',
        clientId: client!.id,
        patternType: 'exact',
        confidence: '1.0',
        source: 'manual',
      });

      await db.delete(clients).where(eq(clients.id, client!.id));

      const remainingMappings = await db
        .select()
        .from(clientEmailMappings)
        .where(eq(clientEmailMappings.clientId, client!.id));

      expect(remainingMappings).toHaveLength(0);
    });
  });

  describe('learned mappings', () => {
    it('creates learned mapping from human correction', async () => {
      const [client] = await db.insert(clients).values(createTestClient()).returning();

      const [mapping] = await db
        .insert(clientEmailMappings)
        .values({
          emailPattern: 'corrected@vendor.com',
          clientId: client!.id,
          patternType: 'exact',
          confidence: '1.0',
          source: 'learned',
          createdBy: '00000000-0000-0000-0000-000000000001', // user ID
        })
        .returning();

      expect(mapping?.source).toBe('learned');
      expect(mapping?.createdBy).toBeDefined();
    });

    it('updates existing mapping via upsert', async () => {
      const [client1] = await db.insert(clients).values(createTestClient({ name: 'Client 1' })).returning();
      const [client2] = await db.insert(clients).values(createTestClient({ name: 'Client 2' })).returning();

      // Create initial mapping
      await db.insert(clientEmailMappings).values({
        emailPattern: 'shared@vendor.com',
        clientId: client1!.id,
        patternType: 'exact',
        confidence: '0.8',
        source: 'learned',
      });

      // Upsert to update to different client
      await db
        .insert(clientEmailMappings)
        .values({
          emailPattern: 'shared@vendor.com',
          clientId: client2!.id,
          patternType: 'exact',
          confidence: '1.0',
          source: 'learned',
        })
        .onConflictDoUpdate({
          target: [clientEmailMappings.emailPattern, clientEmailMappings.patternType],
          set: {
            clientId: client2!.id,
            confidence: '1.0',
            source: 'learned',
          },
        });

      const [updated] = await db
        .select()
        .from(clientEmailMappings)
        .where(eq(clientEmailMappings.emailPattern, 'shared@vendor.com'));

      expect(updated?.clientId).toBe(client2!.id);
      expect(updated?.confidence).toBe('1.00');
    });
  });
});
