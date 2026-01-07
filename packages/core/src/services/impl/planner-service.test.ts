import { describe, it, expect, beforeEach } from 'vitest';
import { PlannerService } from './planner-service.js';
import { EmailDomain, ExtractedData, Classification } from '../../types/email.js';
import { ClientDomain } from '../../types/client.js';

// Sample data for testing
const sampleExtractedData: ExtractedData = {
  vendorName: { value: 'Acme Corp', confidence: 0.95, source: 'body' },
  amount: { value: '1500.00', confidence: 0.92, source: 'body' },
  currency: { value: 'USD', confidence: 0.98, source: 'inferred' },
  dueDate: { value: '2024-01-30', confidence: 0.88, source: 'body' },
  invoiceNumber: { value: 'INV-12345', confidence: 0.99, source: 'subject' },
  description: { value: 'Monthly services', confidence: 0.85, source: 'body' },
  lineItems: [{ description: 'Consulting services', amount: '1500.00' }],
  attachments: [],
  overallConfidence: 0.91,
  warnings: [],
};

const sampleClassification: Classification = {
  emailType: 'invoice',
  intent: 'Request for payment',
  urgency: 'medium',
  confidence: 0.95,
  reasoning: 'Contains invoice details',
};

const createEmail = (overrides: Partial<EmailDomain> = {}): EmailDomain => ({
  id: 'email-123',
  messageId: 'msg-123',
  conversationId: 'conv-123',
  subject: 'Invoice #12345',
  senderEmail: 'billing@acme.com',
  senderName: 'Acme Billing',
  recipientEmail: 'ap@mycompany.com',
  receivedAt: new Date('2024-01-15'),
  bodyText: 'Invoice content',
  bodyHtml: null,
  hasAttachments: false,
  attachments: [],
  status: 'classified',
  classification: sampleClassification,
  clientId: null,
  matchMethod: null,
  matchConfidence: null,
  extractedData: null,
  ...overrides,
});

const createClient = (overrides: Partial<ClientDomain> = {}): ClientDomain => ({
  id: 'client-123',
  name: 'Test Client',
  displayName: 'Test Client Inc',
  quickbooksId: 'qb-123',
  billcomId: null,
  emailDomains: ['testclient.com'],
  knownEmails: ['billing@testclient.com'],
  keywords: ['test'],
  defaultExpenseAccount: '5000',
  approvalThreshold: 5000,
  autoApproveVendors: ['Trusted Vendor'],
  isActive: true,
  ...overrides,
});

describe('PlannerService', () => {
  let service: PlannerService;

  beforeEach(() => {
    service = new PlannerService();
  });

  describe('plan - Invoice emails', () => {
    it('should create a bill action for invoice email', async () => {
      const email = createEmail();
      const result = await service.plan(email, sampleExtractedData, null);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.actions.length).toBeGreaterThan(0);
        const createBillAction = result.value.actions.find(a => a.actionType === 'create_bill');
        expect(createBillAction).toBeDefined();
        expect(createBillAction?.parameters['vendorName']).toBe('Acme Corp');
        expect(createBillAction?.parameters['amount']).toBe('1500.00');
      }
    });

    it('should use QuickBooks when client has quickbooksId', async () => {
      const email = createEmail();
      const client = createClient({ quickbooksId: 'qb-123', billcomId: null });
      const result = await service.plan(email, sampleExtractedData, client);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const action = result.value.actions[0];
        expect(action?.targetSystem).toBe('quickbooks');
      }
    });

    it('should use Bill.com when client has billcomId but not quickbooksId', async () => {
      const email = createEmail();
      const client = createClient({ quickbooksId: null, billcomId: 'bc-123' });
      const result = await service.plan(email, sampleExtractedData, client);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const action = result.value.actions[0];
        expect(action?.targetSystem).toBe('billcom');
      }
    });

    it('should require approval for high amounts (>= $10,000)', async () => {
      const email = createEmail();
      const highAmountData = {
        ...sampleExtractedData,
        amount: { value: '15000.00', confidence: 0.95, source: 'body' as const },
      };
      const result = await service.plan(email, highAmountData, null);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const action = result.value.actions[0];
        expect(action?.requiresApproval).toBe(true);
      }
    });

    it('should require approval for medium amounts with low confidence', async () => {
      const email = createEmail();
      const lowConfidenceData = {
        ...sampleExtractedData,
        amount: { value: '2000.00', confidence: 0.95, source: 'body' as const },
        overallConfidence: 0.6,
      };
      const result = await service.plan(email, lowConfidenceData, null);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const action = result.value.actions[0];
        expect(action?.requiresApproval).toBe(true);
      }
    });

    it('should respect client approval threshold', async () => {
      const email = createEmail();
      const client = createClient({ approvalThreshold: 1000 });
      const result = await service.plan(email, sampleExtractedData, client);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const action = result.value.actions[0];
        expect(action?.requiresApproval).toBe(true); // $1500 > $1000 threshold
      }
    });

    it('should auto-approve for known auto-approve vendors', async () => {
      const email = createEmail();
      const client = createClient({ autoApproveVendors: ['Acme Corp'] });
      const dataWithAutoApproveVendor = {
        ...sampleExtractedData,
        amount: { value: '3000.00', confidence: 0.95, source: 'body' as const },
      };
      const result = await service.plan(email, dataWithAutoApproveVendor, client);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const action = result.value.actions[0];
        expect(action?.requiresApproval).toBe(false);
      }
    });

    it('should include compensation action for create_bill', async () => {
      const email = createEmail();
      const result = await service.plan(email, sampleExtractedData, null);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const action = result.value.actions[0];
        expect(action?.reversibility).toBe('compensate');
        expect(action?.compensation?.actionType).toBe('delete_bill');
      }
    });
  });

  describe('plan - Receipt emails', () => {
    it('should create record_payment action for receipt', async () => {
      const email = createEmail({
        classification: { ...sampleClassification, emailType: 'receipt' },
      });
      const result = await service.plan(email, sampleExtractedData, null);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const action = result.value.actions.find(a => a.actionType === 'record_payment');
        expect(action).toBeDefined();
        expect(action?.requiresApproval).toBe(false); // Receipts are lower risk
      }
    });
  });

  describe('plan - Payment notice emails', () => {
    it('should create reconcile action for payment notice', async () => {
      const email = createEmail({
        classification: { ...sampleClassification, emailType: 'payment_notice' },
      });
      const result = await service.plan(email, sampleExtractedData, null);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const action = result.value.actions.find(a => a.actionType === 'reconcile');
        expect(action).toBeDefined();
        expect(action?.targetSystem).toBe('internal');
      }
    });
  });

  describe('plan - Inquiry and Irrelevant emails', () => {
    it('should not create actions for inquiry emails', async () => {
      const email = createEmail({
        classification: { ...sampleClassification, emailType: 'inquiry' },
      });
      const result = await service.plan(email, sampleExtractedData, null);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.actions).toHaveLength(0);
        expect(result.value.reasoning).toContain('inquiry');
      }
    });

    it('should not create actions for irrelevant emails', async () => {
      const email = createEmail({
        classification: { ...sampleClassification, emailType: 'irrelevant' },
      });
      const result = await service.plan(email, sampleExtractedData, null);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.actions).toHaveLength(0);
      }
    });
  });

  describe('plan - Error handling', () => {
    it('should return error for unclassified email', async () => {
      const email = createEmail({ classification: null });
      const result = await service.plan(email, sampleExtractedData, null);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_DATA');
      }
    });

    it('should handle missing vendor/amount gracefully', async () => {
      const email = createEmail();
      const incompleteData = {
        ...sampleExtractedData,
        vendorName: { value: null, confidence: 0, source: 'body' as const },
      };
      const result = await service.plan(email, incompleteData, null);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.actions).toHaveLength(0);
        expect(result.value.reasoning).toContain('Insufficient data');
      }
    });
  });

  describe('plan - Options filtering', () => {
    it('should filter actions by allowed types', async () => {
      const serviceWithFilter = new PlannerService({
        allowedActionTypes: ['record_payment'],
      });
      const email = createEmail();
      const result = await serviceWithFilter.plan(email, sampleExtractedData, null);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // create_bill should be filtered out
        const createBillAction = result.value.actions.find(a => a.actionType === 'create_bill');
        expect(createBillAction).toBeUndefined();
      }
    });
  });
});
