import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, and } from 'drizzle-orm';
import {
  getTestDb,
  createTestTables,
  dropTestTables,
  cleanDatabase,
  closeTestDb,
  type TestDb,
} from '../test/setup.js';
import {
  generateUniqueEmail,
  createTestAction,
  createTestSaga,
  createTestSagaStep,
} from '../test/fixtures.js';
import { emails, actions, sagas, type SagaStepDefinition } from '../schema/index.js';

describe('ActionRepository Integration Tests', () => {
  let db: TestDb;
  let testEmailId: string;

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
    // Create a test email for foreign key references
    const [email] = await db.insert(emails).values(generateUniqueEmail()).returning();
    testEmailId = email!.id;
  });

  describe('create', () => {
    it('creates a new action', async () => {
      const actionData = createTestAction(testEmailId);

      const [created] = await db.insert(actions).values(actionData).returning();

      expect(created).toBeDefined();
      expect(created?.id).toBeDefined();
      expect(created?.emailId).toBe(testEmailId);
      expect(created?.actionType).toBe('create_bill');
      expect(created?.status).toBe('pending');
    });

    it('creates action with risk assessment', async () => {
      const actionData = createTestAction(testEmailId, {
        riskLevel: 'high',
        riskReasons: ['New vendor', 'Large amount'],
        requiresApproval: true,
      });

      const [created] = await db.insert(actions).values(actionData).returning();

      expect(created?.riskLevel).toBe('high');
      expect(created?.riskReasons).toContain('New vendor');
      expect(created?.requiresApproval).toBe(true);
    });

    it('creates action with complex parameters', async () => {
      const actionData = createTestAction(testEmailId, {
        actionType: 'create_bill',
        targetSystem: 'quickbooks',
        parameters: {
          vendorName: 'Acme Corp',
          amount: 15000.0,
          dueDate: '2024-03-01',
          lineItems: [
            { description: 'Service A', amount: 10000 },
            { description: 'Service B', amount: 5000 },
          ],
          metadata: {
            invoiceNumber: 'INV-001',
            poNumber: 'PO-123',
          },
        },
      });

      const [created] = await db.insert(actions).values(actionData).returning();

      expect(created?.parameters).toBeDefined();
      const params = created?.parameters as Record<string, unknown>;
      expect(params['vendorName']).toBe('Acme Corp');
      expect(params['amount']).toBe(15000.0);
      expect((params['lineItems'] as unknown[]).length).toBe(2);
    });
  });

  describe('findById', () => {
    it('finds action by id', async () => {
      const actionData = createTestAction(testEmailId);
      const [created] = await db.insert(actions).values(actionData).returning();

      const [found] = await db
        .select()
        .from(actions)
        .where(eq(actions.id, created!.id))
        .limit(1);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created!.id);
    });
  });

  describe('findByEmailId', () => {
    it('finds all actions for an email', async () => {
      await db.insert(actions).values([
        createTestAction(testEmailId, { actionType: 'create_bill' }),
        createTestAction(testEmailId, { actionType: 'schedule_payment' }),
        createTestAction(testEmailId, { actionType: 'send_invoice' }),
      ]);

      const found = await db
        .select()
        .from(actions)
        .where(eq(actions.emailId, testEmailId));

      expect(found).toHaveLength(3);
    });
  });

  describe('status updates', () => {
    it('approves action', async () => {
      const actionData = createTestAction(testEmailId, { requiresApproval: true });
      const [created] = await db.insert(actions).values(actionData).returning();

      const [approved] = await db
        .update(actions)
        .set({
          status: 'approved',
          approvedBy: '00000000-0000-0000-0000-000000000001',
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(actions.id, created!.id))
        .returning();

      expect(approved?.status).toBe('approved');
      expect(approved?.approvedBy).toBeDefined();
      expect(approved?.approvedAt).toBeDefined();
    });

    it('rejects action with reason', async () => {
      const actionData = createTestAction(testEmailId, { requiresApproval: true });
      const [created] = await db.insert(actions).values(actionData).returning();

      const [rejected] = await db
        .update(actions)
        .set({
          status: 'rejected',
          rejectedBy: '00000000-0000-0000-0000-000000000001',
          rejectedAt: new Date(),
          rejectionReason: 'Amount exceeds budget',
          updatedAt: new Date(),
        })
        .where(eq(actions.id, created!.id))
        .returning();

      expect(rejected?.status).toBe('rejected');
      expect(rejected?.rejectionReason).toBe('Amount exceeds budget');
    });

    it('marks action as executing', async () => {
      const actionData = createTestAction(testEmailId);
      const [created] = await db.insert(actions).values(actionData).returning();

      const [executing] = await db
        .update(actions)
        .set({
          status: 'executing',
          updatedAt: new Date(),
        })
        .where(eq(actions.id, created!.id))
        .returning();

      expect(executing?.status).toBe('executing');
    });

    it('completes action with result', async () => {
      const actionData = createTestAction(testEmailId);
      const [created] = await db.insert(actions).values(actionData).returning();

      const result = {
        success: true,
        externalId: 'qb-bill-123',
        data: { transactionId: 'txn-456' },
      };

      const [completed] = await db
        .update(actions)
        .set({
          status: 'completed',
          executedAt: new Date(),
          result,
          externalId: result.externalId,
          updatedAt: new Date(),
        })
        .where(eq(actions.id, created!.id))
        .returning();

      expect(completed?.status).toBe('completed');
      expect(completed?.result?.success).toBe(true);
      expect(completed?.externalId).toBe('qb-bill-123');
    });

    it('fails action with error', async () => {
      const actionData = createTestAction(testEmailId);
      const [created] = await db.insert(actions).values(actionData).returning();

      const [failed] = await db
        .update(actions)
        .set({
          status: 'failed',
          executedAt: new Date(),
          result: { success: false, error: 'Vendor not found' },
          error: 'Vendor not found in QuickBooks',
          updatedAt: new Date(),
        })
        .where(eq(actions.id, created!.id))
        .returning();

      expect(failed?.status).toBe('failed');
      expect(failed?.error).toContain('Vendor not found');
    });
  });

  describe('compensation', () => {
    it('marks action as compensated', async () => {
      const actionData = createTestAction(testEmailId);
      const [created] = await db.insert(actions).values(actionData).returning();

      // First complete the action
      await db
        .update(actions)
        .set({
          status: 'completed',
          executedAt: new Date(),
          externalId: 'qb-bill-123',
        })
        .where(eq(actions.id, created!.id));

      // Create compensation action
      const [compensation] = await db
        .insert(actions)
        .values(
          createTestAction(testEmailId, {
            actionType: 'delete_bill',
            parameters: { billId: 'qb-bill-123' },
          })
        )
        .returning();

      // Mark original as compensated
      const [compensated] = await db
        .update(actions)
        .set({
          status: 'compensated',
          isCompensated: true,
          compensatedAt: new Date(),
          compensationId: compensation!.id,
          updatedAt: new Date(),
        })
        .where(eq(actions.id, created!.id))
        .returning();

      expect(compensated?.status).toBe('compensated');
      expect(compensated?.isCompensated).toBe(true);
      expect(compensated?.compensationId).toBe(compensation!.id);
    });
  });

  describe('filter by status', () => {
    beforeEach(async () => {
      await db.insert(actions).values([
        createTestAction(testEmailId, { status: 'pending' }),
        createTestAction(testEmailId, { status: 'pending' }),
        createTestAction(testEmailId, { status: 'approved' }),
        createTestAction(testEmailId, { status: 'completed' }),
        createTestAction(testEmailId, { status: 'failed' }),
      ]);
    });

    it('filters pending actions', async () => {
      const pending = await db
        .select()
        .from(actions)
        .where(eq(actions.status, 'pending'));

      expect(pending).toHaveLength(2);
    });

    it('filters actions requiring approval', async () => {
      await cleanDatabase();
      const [email] = await db.insert(emails).values(generateUniqueEmail()).returning();

      await db.insert(actions).values([
        createTestAction(email!.id, { status: 'pending', requiresApproval: true }),
        createTestAction(email!.id, { status: 'pending', requiresApproval: true }),
        createTestAction(email!.id, { status: 'pending', requiresApproval: false }),
      ]);

      const needingApproval = await db
        .select()
        .from(actions)
        .where(
          and(
            eq(actions.status, 'pending'),
            eq(actions.requiresApproval, true)
          )
        );

      expect(needingApproval).toHaveLength(2);
    });
  });

  describe('saga integration', () => {
    it('creates action linked to saga', async () => {
      const [saga] = await db
        .insert(sagas)
        .values(createTestSaga(testEmailId))
        .returning();

      const actionData = createTestAction(testEmailId, {
        sagaId: saga!.id,
      });
      const [created] = await db.insert(actions).values(actionData).returning();

      expect(created?.sagaId).toBe(saga!.id);
    });

    it('finds all actions in a saga', async () => {
      const [saga] = await db
        .insert(sagas)
        .values(createTestSaga(testEmailId))
        .returning();

      await db.insert(actions).values([
        createTestAction(testEmailId, { sagaId: saga!.id, actionType: 'create_bill' }),
        createTestAction(testEmailId, { sagaId: saga!.id, actionType: 'schedule_payment' }),
      ]);

      const sagaActions = await db
        .select()
        .from(actions)
        .where(eq(actions.sagaId, saga!.id));

      expect(sagaActions).toHaveLength(2);
    });

    it('saga steps track individual operations via JSONB', async () => {
      const steps: SagaStepDefinition[] = [
        createTestSagaStep({
          id: 'step-1',
          name: 'Create Bill',
          actionType: 'create_bill',
          status: 'completed',
          result: { success: true, externalId: 'bill-123' },
          executedAt: new Date().toISOString(),
        }),
        createTestSagaStep({
          id: 'step-2',
          name: 'Schedule Payment',
          actionType: 'schedule_payment',
          status: 'pending',
        }),
      ];

      const [saga] = await db
        .insert(sagas)
        .values(createTestSaga(testEmailId, { steps, totalSteps: steps.length }))
        .returning();

      expect(saga).toBeDefined();
      expect(saga!.steps).toHaveLength(2);
      expect(saga!.steps[0]!.status).toBe('completed');
      expect(saga!.steps[0]!.result?.externalId).toBe('bill-123');
      expect(saga!.steps[1]!.status).toBe('pending');
    });

    it('updates saga step status via JSONB update', async () => {
      const initialSteps: SagaStepDefinition[] = [
        createTestSagaStep({ id: 'step-1', status: 'pending' }),
        createTestSagaStep({ id: 'step-2', status: 'pending' }),
      ];

      const [saga] = await db
        .insert(sagas)
        .values(createTestSaga(testEmailId, { steps: initialSteps, totalSteps: 2 }))
        .returning();

      // Update the first step to completed
      const firstStep = saga!.steps[0]!;
      const updatedSteps: SagaStepDefinition[] = [
        {
          ...firstStep,
          status: 'completed',
          result: { success: true, externalId: 'qb-123' },
          executedAt: new Date().toISOString(),
        },
        saga!.steps[1]!,
      ];

      const [updated] = await db
        .update(sagas)
        .set({
          steps: updatedSteps,
          currentStep: 1,
          updatedAt: new Date(),
        })
        .where(eq(sagas.id, saga!.id))
        .returning();

      expect(updated).toBeDefined();
      expect(updated!.steps[0]!.status).toBe('completed');
      expect(updated!.steps[1]!.status).toBe('pending');
      expect(updated!.currentStep).toBe(1);
    });
  });

  describe('risk level filtering', () => {
    beforeEach(async () => {
      await db.insert(actions).values([
        createTestAction(testEmailId, { riskLevel: 'low' }),
        createTestAction(testEmailId, { riskLevel: 'medium' }),
        createTestAction(testEmailId, { riskLevel: 'high' }),
        createTestAction(testEmailId, { riskLevel: 'critical' }),
      ]);
    });

    it('filters by risk level', async () => {
      const highRisk = await db
        .select()
        .from(actions)
        .where(eq(actions.riskLevel, 'high'));

      const critical = await db
        .select()
        .from(actions)
        .where(eq(actions.riskLevel, 'critical'));

      expect(highRisk).toHaveLength(1);
      expect(critical).toHaveLength(1);
    });
  });
});
