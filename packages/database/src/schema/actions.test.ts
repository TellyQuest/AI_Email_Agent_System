import { describe, it, expect } from 'vitest';
import {
  actionTypeValues,
  targetSystemValues,
  riskLevelValues,
  actionStatusValues,
  type ActionType,
  type TargetSystem,
  type RiskLevel,
  type ActionStatus,
  type ActionResult,
} from './actions.js';

describe('Action schema types', () => {
  describe('actionTypeValues', () => {
    it('contains all action types', () => {
      expect(actionTypeValues).toContain('create_bill');
      expect(actionTypeValues).toContain('update_bill');
      expect(actionTypeValues).toContain('delete_bill');
      expect(actionTypeValues).toContain('create_invoice');
      expect(actionTypeValues).toContain('record_payment');
      expect(actionTypeValues).toContain('schedule_payment');
      expect(actionTypeValues).toContain('execute_payment');
      expect(actionTypeValues).toContain('reconcile');
    });

    it('has exactly 10 action types', () => {
      expect(actionTypeValues).toHaveLength(10);
    });
  });

  describe('targetSystemValues', () => {
    it('contains all target systems', () => {
      expect(targetSystemValues).toContain('quickbooks');
      expect(targetSystemValues).toContain('billcom');
      expect(targetSystemValues).toContain('internal');
    });

    it('has exactly 3 target systems', () => {
      expect(targetSystemValues).toHaveLength(3);
    });
  });

  describe('riskLevelValues', () => {
    it('contains risk levels in order of severity', () => {
      expect(riskLevelValues).toEqual(['low', 'medium', 'high', 'critical']);
    });
  });

  describe('actionStatusValues', () => {
    it('contains all action statuses', () => {
      expect(actionStatusValues).toContain('pending');
      expect(actionStatusValues).toContain('approved');
      expect(actionStatusValues).toContain('rejected');
      expect(actionStatusValues).toContain('executing');
      expect(actionStatusValues).toContain('completed');
      expect(actionStatusValues).toContain('failed');
      expect(actionStatusValues).toContain('compensated');
    });

    it('has exactly 7 action statuses', () => {
      expect(actionStatusValues).toHaveLength(7);
    });
  });

  describe('ActionResult type', () => {
    it('accepts successful result', () => {
      const result: ActionResult = {
        success: true,
        externalId: 'qb-123',
        data: { billId: 'bill-456' },
      };

      expect(result.success).toBe(true);
      expect(result.externalId).toBe('qb-123');
    });

    it('accepts failed result with error', () => {
      const result: ActionResult = {
        success: false,
        error: 'API rate limit exceeded',
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('allows minimal result', () => {
      const result: ActionResult = {
        success: true,
      };

      expect(result.success).toBe(true);
      expect(result.externalId).toBeUndefined();
    });
  });

  describe('Type compatibility', () => {
    it('ActionType values are assignable', () => {
      const types: ActionType[] = [
        'create_bill',
        'update_bill',
        'delete_bill',
        'create_invoice',
        'update_invoice',
        'record_payment',
        'schedule_payment',
        'execute_payment',
        'reconcile',
        'send_invoice',
      ];
      expect(types).toHaveLength(10);
    });

    it('TargetSystem values are assignable', () => {
      const systems: TargetSystem[] = ['quickbooks', 'billcom', 'internal'];
      expect(systems).toHaveLength(3);
    });

    it('RiskLevel values are assignable', () => {
      const levels: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
      expect(levels).toHaveLength(4);
    });

    it('ActionStatus values are assignable', () => {
      const statuses: ActionStatus[] = [
        'pending',
        'approved',
        'rejected',
        'executing',
        'completed',
        'failed',
        'compensated',
      ];
      expect(statuses).toHaveLength(7);
    });
  });
});
