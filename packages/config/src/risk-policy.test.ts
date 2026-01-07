import { describe, it, expect, beforeEach } from 'vitest';
import {
  RiskLevel,
  getDefaultRiskPolicy,
  clearRiskPolicyCache,
  type RiskPolicy,
  type RiskRule,
  type RiskBehavior,
  type ClientOverride,
} from './risk-policy.js';

describe('Risk policy configuration', () => {
  beforeEach(() => {
    clearRiskPolicyCache();
  });

  describe('RiskLevel', () => {
    it('defines all risk levels', () => {
      expect(RiskLevel.LOW).toBe('low');
      expect(RiskLevel.MEDIUM).toBe('medium');
      expect(RiskLevel.HIGH).toBe('high');
      expect(RiskLevel.CRITICAL).toBe('critical');
    });

    it('has 4 distinct levels', () => {
      const levels = Object.values(RiskLevel);
      expect(levels).toHaveLength(4);
    });
  });

  describe('getDefaultRiskPolicy', () => {
    let policy: RiskPolicy;

    beforeEach(() => {
      policy = getDefaultRiskPolicy();
    });

    it('returns a valid policy object', () => {
      expect(policy).toBeDefined();
      expect(policy.version).toBe('1.0');
    });

    it('has sensible default settings', () => {
      expect(policy.settings.defaultRiskLevel).toBe('medium');
      expect(policy.settings.requireApprovalForNewVendors).toBe(true);
      expect(policy.settings.requireApprovalForNewClients).toBe(true);
    });

    it('includes critical amount rule', () => {
      const criticalRule = policy.rules.find((r) => r.name === 'critical_amount');
      expect(criticalRule).toBeDefined();
      expect(criticalRule?.condition.field).toBe('amount');
      expect(criticalRule?.condition.operator).toBe('>');
      expect(criticalRule?.condition.value).toBe(25000);
      expect(criticalRule?.riskLevel).toBe('critical');
      expect(criticalRule?.requiresApproval).toBe(true);
    });

    it('includes high amount rule', () => {
      const highRule = policy.rules.find((r) => r.name === 'high_amount');
      expect(highRule).toBeDefined();
      expect(highRule?.condition.value).toBe(5000);
      expect(highRule?.riskLevel).toBe('high');
    });

    it('includes new vendor rule', () => {
      const newVendorRule = policy.rules.find((r) => r.name === 'new_vendor');
      expect(newVendorRule).toBeDefined();
      expect(newVendorRule?.condition.field).toBe('vendor_transaction_count');
      expect(newVendorRule?.condition.operator).toBe('==');
      expect(newVendorRule?.condition.value).toBe(0);
    });

    it('includes low confidence rule', () => {
      const lowConfRule = policy.rules.find((r) => r.name === 'low_confidence');
      expect(lowConfRule).toBeDefined();
      expect(lowConfRule?.condition.field).toBe('extraction_confidence');
      expect(lowConfRule?.condition.operator).toBe('<');
      expect(lowConfRule?.condition.value).toBe(0.8);
    });

    it('includes payment execution rule', () => {
      const paymentRule = policy.rules.find((r) => r.name === 'payment_execution');
      expect(paymentRule).toBeDefined();
      expect(paymentRule?.condition.field).toBe('action_type');
      expect(paymentRule?.condition.operator).toBe('in');
      expect(paymentRule?.condition.value).toContain('execute_payment');
      expect(paymentRule?.condition.value).toContain('schedule_payment');
      expect(paymentRule?.riskLevel).toBe('critical');
    });

    it('defines behaviors for all risk levels', () => {
      expect(policy.riskBehaviors.critical).toBeDefined();
      expect(policy.riskBehaviors.high).toBeDefined();
      expect(policy.riskBehaviors.medium).toBeDefined();
      expect(policy.riskBehaviors.low).toBeDefined();
    });

    it('critical risk requires approval with short timeout', () => {
      const criticalBehavior = policy.riskBehaviors.critical;
      expect(criticalBehavior.requiresApproval).toBe(true);
      expect(criticalBehavior.approvalTimeoutHours).toBe(24);
      expect(criticalBehavior.escalateAfterHours).toBe(4);
    });

    it('high risk requires approval with longer timeout', () => {
      const highBehavior = policy.riskBehaviors.high;
      expect(highBehavior.requiresApproval).toBe(true);
      expect(highBehavior.approvalTimeoutHours).toBe(48);
      expect(highBehavior.escalateAfterHours).toBe(24);
    });

    it('medium risk does not require approval', () => {
      const mediumBehavior = policy.riskBehaviors.medium;
      expect(mediumBehavior.requiresApproval).toBe(false);
      expect(mediumBehavior.includeInDailySummary).toBe(true);
    });

    it('low risk does not require approval', () => {
      const lowBehavior = policy.riskBehaviors.low;
      expect(lowBehavior.requiresApproval).toBe(false);
      expect(lowBehavior.includeInWeeklySummary).toBe(true);
    });

    it('critical and high risk notify via email and slack', () => {
      expect(policy.riskBehaviors.critical.notifyChannels).toContain('email');
      expect(policy.riskBehaviors.critical.notifyChannels).toContain('slack');
      expect(policy.riskBehaviors.high.notifyChannels).toContain('email');
      expect(policy.riskBehaviors.high.notifyChannels).toContain('slack');
    });
  });

  describe('RiskRule type', () => {
    it('accepts valid rule', () => {
      const rule: RiskRule = {
        name: 'test_rule',
        description: 'Test description',
        condition: {
          field: 'amount',
          operator: '>',
          value: 1000,
        },
        riskLevel: 'high',
        requiresApproval: true,
      };

      expect(rule.name).toBe('test_rule');
      expect(rule.condition.operator).toBe('>');
    });

    it('supports array values in conditions', () => {
      const rule: RiskRule = {
        name: 'array_rule',
        description: 'Uses array condition',
        condition: {
          field: 'action_type',
          operator: 'in',
          value: ['create_bill', 'update_bill'],
        },
        riskLevel: 'medium',
        requiresApproval: false,
      };

      expect(rule.condition.value).toHaveLength(2);
    });
  });

  describe('RiskBehavior type', () => {
    it('accepts full behavior config', () => {
      const behavior: RiskBehavior = {
        requiresApproval: true,
        approvalTimeoutHours: 12,
        escalateAfterHours: 2,
        notifyChannels: ['email', 'slack', 'sms'],
        includeInDailySummary: true,
        includeInWeeklySummary: true,
      };

      expect(behavior.notifyChannels).toHaveLength(3);
    });

    it('accepts minimal behavior config', () => {
      const behavior: RiskBehavior = {
        requiresApproval: false,
      };

      expect(behavior.approvalTimeoutHours).toBeUndefined();
    });
  });

  describe('ClientOverride type', () => {
    it('accepts full override config', () => {
      const override: ClientOverride = {
        clientId: 'client-123',
        approvalThreshold: 10000,
        autoApproveVendors: ['vendor-1', 'vendor-2'],
        riskLevelOverride: 'low',
      };

      expect(override.clientId).toBe('client-123');
      expect(override.autoApproveVendors).toHaveLength(2);
    });

    it('accepts minimal override config', () => {
      const override: ClientOverride = {
        clientId: 'client-456',
      };

      expect(override.approvalThreshold).toBeUndefined();
      expect(override.riskLevelOverride).toBeUndefined();
    });
  });

  describe('clearRiskPolicyCache', () => {
    it('clears cached policy', () => {
      // Get policy to cache it
      const policy1 = getDefaultRiskPolicy();

      // Clear cache
      clearRiskPolicyCache();

      // Get policy again - should be a new object (but same values)
      const policy2 = getDefaultRiskPolicy();

      expect(policy1).toEqual(policy2);
      expect(policy1).not.toBe(policy2); // Different object references
    });
  });
});
