import { describe, it, expect, beforeEach } from 'vitest';
import { ValidatorService } from './validator-service.js';
import { ActionPlan, ProposedAction } from '../../types/action.js';
import { ClientDomain } from '../../types/client.js';
import { RiskPolicy } from '@ai-email-agent/config';

// Custom test policy
const testPolicy: RiskPolicy = {
  version: '1.0-test',
  settings: {
    defaultRiskLevel: 'low',
    requireApprovalForNewVendors: true,
    requireApprovalForNewClients: true,
  },
  rules: [
    {
      name: 'high_amount',
      description: 'High value transactions require approval',
      condition: { field: 'amount', operator: '>', value: 5000 },
      riskLevel: 'high',
      requiresApproval: true,
    },
    {
      name: 'critical_amount',
      description: 'Very high value transactions are critical',
      condition: { field: 'amount', operator: '>', value: 25000 },
      riskLevel: 'critical',
      requiresApproval: true,
    },
    {
      name: 'payment_action',
      description: 'Payment actions require approval',
      condition: { field: 'action_type', operator: 'in', value: ['execute_payment', 'schedule_payment'] },
      riskLevel: 'high',
      requiresApproval: true,
    },
    {
      name: 'low_confidence',
      description: 'Low confidence extractions',
      condition: { field: 'extraction_confidence', operator: '<', value: 0.7 },
      riskLevel: 'high',
      requiresApproval: true,
    },
  ],
  riskBehaviors: {
    low: { requiresApproval: false },
    medium: { requiresApproval: false },
    high: { requiresApproval: true },
    critical: { requiresApproval: true },
  },
};

const createAction = (overrides: Partial<ProposedAction> = {}): ProposedAction => ({
  id: 'action-123',
  actionType: 'create_bill',
  targetSystem: 'quickbooks',
  parameters: {
    vendorName: 'Acme Corp',
    amount: '1000.00',
    currency: 'USD',
  },
  reversibility: 'compensate',
  requiresApproval: false,
  ...overrides,
});

const createPlan = (actions: ProposedAction[] = [createAction()]): ActionPlan => ({
  emailId: 'email-123',
  actions,
  reasoning: 'Test plan',
});

const createClient = (overrides: Partial<ClientDomain> = {}): ClientDomain => ({
  id: 'client-123',
  name: 'Test Client',
  displayName: 'Test Client Inc',
  quickbooksId: 'qb-123',
  billcomId: null,
  emailDomains: ['testclient.com'],
  knownEmails: [],
  keywords: [],
  defaultExpenseAccount: null,
  approvalThreshold: 5000,
  autoApproveVendors: [],
  isActive: true,
  ...overrides,
});

describe('ValidatorService', () => {
  let service: ValidatorService;

  beforeEach(() => {
    service = new ValidatorService(testPolicy);
  });

  describe('validate', () => {
    it('should validate a low-risk plan successfully', async () => {
      // Use a policy without new vendor/client rules to test pure risk assessment
      const policyNoNewRules: RiskPolicy = {
        ...testPolicy,
        settings: {
          ...testPolicy.settings,
          requireApprovalForNewVendors: false,
          requireApprovalForNewClients: false,
        },
      };
      const serviceNoNewRules = new ValidatorService(policyNoNewRules);
      const plan = createPlan([createAction({ parameters: { amount: '500.00' } })]);
      const result = await serviceNoNewRules.validate(plan, createClient());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.valid).toBe(true);
        expect(result.value.riskLevel).toBe('low');
        expect(result.value.requiresApproval).toBe(false);
      }
    });

    it('should flag high-amount transactions', async () => {
      const plan = createPlan([createAction({ parameters: { amount: '10000.00' } })]);
      const result = await service.validate(plan, null);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.riskLevel).toBe('high');
        expect(result.value.requiresApproval).toBe(true);
        expect(result.value.appliedRules).toContain('high_amount');
      }
    });

    it('should flag critical-amount transactions', async () => {
      const plan = createPlan([createAction({ parameters: { amount: '50000.00' } })]);
      const result = await service.validate(plan, null);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.riskLevel).toBe('critical');
        expect(result.value.requiresApproval).toBe(true);
        expect(result.value.appliedRules).toContain('critical_amount');
      }
    });

    it('should flag payment actions as high risk', async () => {
      const plan = createPlan([
        createAction({
          actionType: 'schedule_payment',
          parameters: { amount: '1000.00' },
        }),
      ]);
      const result = await service.validate(plan, null);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.riskLevel).toBe('high');
        expect(result.value.appliedRules).toContain('payment_action');
      }
    });

    it('should require approval for new vendors', async () => {
      const plan = createPlan([createAction({ parameters: { amount: '500.00' } })]);
      // Context with vendorTransactionCount = 0 triggers new vendor rule
      const result = await service.validate(plan, null);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.requiresApproval).toBe(true);
        expect(result.value.appliedRules).toContain('new_vendor_policy');
      }
    });

    it('should require approval for unmatched clients', async () => {
      const plan = createPlan([createAction()]);
      const result = await service.validate(plan, null);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.requiresApproval).toBe(true);
        expect(result.value.appliedRules).toContain('new_client_policy');
      }
    });

    it('should not require new client approval when client is matched', async () => {
      const serviceNoNewVendor = new ValidatorService({
        ...testPolicy,
        settings: { ...testPolicy.settings, requireApprovalForNewVendors: false },
      });
      const plan = createPlan([createAction({ parameters: { amount: '500.00' } })]);
      const client = createClient();
      const result = await serviceNoNewVendor.validate(plan, client);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.appliedRules).not.toContain('new_client_policy');
      }
    });

    it('should combine risks from multiple actions', async () => {
      const plan = createPlan([
        createAction({ id: 'action-1', parameters: { amount: '500.00' } }),
        createAction({ id: 'action-2', actionType: 'schedule_payment', parameters: { amount: '500.00' } }),
      ]);
      const result = await service.validate(plan, createClient());

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should pick the highest risk level from all actions
        expect(result.value.riskLevel).toBe('high');
      }
    });

    it('should deduplicate applied rules', async () => {
      const plan = createPlan([
        createAction({ id: 'action-1', parameters: { amount: '10000.00' } }),
        createAction({ id: 'action-2', parameters: { amount: '15000.00' } }),
      ]);
      const result = await service.validate(plan, createClient());

      expect(result.ok).toBe(true);
      if (result.ok) {
        const highAmountCount = result.value.appliedRules.filter(r => r === 'high_amount').length;
        expect(highAmountCount).toBe(1);
      }
    });
  });

  describe('assessRisk', () => {
    it('should assess risk for a single action', async () => {
      const result = await service.assessRisk('create_bill', { amount: '10000.00' }, {
        clientId: 'client-123',
        vendorTransactionCount: 5,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.level).toBe('high');
        expect(result.value.requiresApproval).toBe(true);
      }
    });

    it('should flag low confidence extractions', async () => {
      const result = await service.assessRisk('create_bill', { amount: '500.00' }, {
        clientId: 'client-123',
        vendorTransactionCount: 5,
        extractionConfidence: 0.5,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.level).toBe('high');
        expect(result.value.appliedRules).toContain('low_confidence');
      }
    });

    it('should allow override for non-critical risks', async () => {
      const result = await service.assessRisk('create_bill', { amount: '10000.00' }, {
        clientId: 'client-123',
        vendorTransactionCount: 5,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.overrideAllowed).toBe(true);
      }
    });

    it('should not allow override for critical risks', async () => {
      const result = await service.assessRisk('create_bill', { amount: '50000.00' }, {
        clientId: 'client-123',
        vendorTransactionCount: 5,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.overrideAllowed).toBe(false);
      }
    });
  });

  describe('strict mode', () => {
    it('should treat warnings as errors in strict mode', async () => {
      const strictService = new ValidatorService(testPolicy, { strictMode: true });
      const plan = createPlan([createAction({ parameters: { amount: '10000.00' } })]);
      const result = await strictService.validate(plan, createClient());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.violations.length).toBeGreaterThan(0);
        expect(result.value.valid).toBe(false);
      }
    });
  });

  describe('skip rules', () => {
    it('should skip specified rules', async () => {
      const serviceWithSkip = new ValidatorService(testPolicy, {
        skipRules: ['high_amount'],
      });
      const plan = createPlan([createAction({ parameters: { amount: '10000.00' } })]);
      const result = await serviceWithSkip.validate(plan, createClient());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.appliedRules).not.toContain('high_amount');
      }
    });
  });

  describe('client overrides', () => {
    it('should apply client risk level override', async () => {
      const policyWithOverride: RiskPolicy = {
        ...testPolicy,
        clientOverrides: [
          { clientId: 'client-123', riskLevelOverride: 'low' },
        ],
      };
      const serviceWithOverride = new ValidatorService(policyWithOverride);
      const plan = createPlan([createAction({ parameters: { amount: '10000.00' } })]);
      const client = createClient({ id: 'client-123' });
      const result = await serviceWithOverride.validate(plan, client);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.riskLevel).toBe('low');
        expect(result.value.appliedRules).toContain('client_risk_override');
      }
    });
  });

  describe('amount parsing', () => {
    it('should parse amount with currency symbol', async () => {
      const plan = createPlan([createAction({ parameters: { amount: '$10,000.00' } })]);
      const result = await service.validate(plan, createClient());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.appliedRules).toContain('high_amount');
      }
    });

    it('should handle numeric amounts', async () => {
      const plan = createPlan([createAction({ parameters: { amount: 10000 } })]);
      const result = await service.validate(plan, createClient());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.appliedRules).toContain('high_amount');
      }
    });
  });
});
