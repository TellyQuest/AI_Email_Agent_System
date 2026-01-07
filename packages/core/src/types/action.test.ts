import { describe, it, expect } from 'vitest';
import {
  ActionType,
  TargetSystem,
  RiskLevel,
  ActionStatus,
  Reversibility,
  type CompensationAction,
  type ProposedAction,
  type ActionPlan,
  type ActionResult,
  type RuleViolation,
  type ValidationResult,
  type RiskAssessment,
  type ActionDomain,
} from './action.js';

describe('Action types', () => {
  describe('ActionType', () => {
    it('covers all bookkeeping action types', () => {
      expect(ActionType.CREATE_BILL).toBe('create_bill');
      expect(ActionType.UPDATE_BILL).toBe('update_bill');
      expect(ActionType.DELETE_BILL).toBe('delete_bill');
      expect(ActionType.CREATE_INVOICE).toBe('create_invoice');
      expect(ActionType.UPDATE_INVOICE).toBe('update_invoice');
      expect(ActionType.RECORD_PAYMENT).toBe('record_payment');
      expect(ActionType.SCHEDULE_PAYMENT).toBe('schedule_payment');
      expect(ActionType.EXECUTE_PAYMENT).toBe('execute_payment');
      expect(ActionType.SEND_INVOICE).toBe('send_invoice');
      expect(ActionType.RECONCILE).toBe('reconcile');
    });

    it('has 10 distinct action types', () => {
      const types = Object.values(ActionType);
      expect(types).toHaveLength(10);
    });
  });

  describe('TargetSystem', () => {
    it('includes all supported systems', () => {
      expect(TargetSystem.QUICKBOOKS).toBe('quickbooks');
      expect(TargetSystem.BILLCOM).toBe('billcom');
      expect(TargetSystem.INTERNAL).toBe('internal');
    });
  });

  describe('RiskLevel', () => {
    it('has risk levels in ascending severity', () => {
      const levels = [RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL];
      expect(levels).toEqual(['low', 'medium', 'high', 'critical']);
    });
  });

  describe('ActionStatus', () => {
    it('covers complete action lifecycle', () => {
      expect(ActionStatus.PENDING).toBe('pending');
      expect(ActionStatus.APPROVED).toBe('approved');
      expect(ActionStatus.REJECTED).toBe('rejected');
      expect(ActionStatus.EXECUTING).toBe('executing');
      expect(ActionStatus.COMPLETED).toBe('completed');
      expect(ActionStatus.FAILED).toBe('failed');
      expect(ActionStatus.COMPENSATED).toBe('compensated');
    });
  });

  describe('Reversibility', () => {
    it('defines action reversibility levels', () => {
      expect(Reversibility.FULL).toBe('full');
      expect(Reversibility.COMPENSATE).toBe('compensate');
      expect(Reversibility.SOFT_IRREVERSIBLE).toBe('soft_irreversible');
      expect(Reversibility.HARD_IRREVERSIBLE).toBe('hard_irreversible');
    });
  });

  describe('CompensationAction interface', () => {
    it('defines how to undo an action', () => {
      const compensation: CompensationAction = {
        actionType: ActionType.DELETE_BILL,
        targetSystem: TargetSystem.QUICKBOOKS,
        parameters: { billId: 'bill-123' },
      };

      expect(compensation.actionType).toBe('delete_bill');
      expect(compensation.parameters['billId']).toBe('bill-123');
    });
  });

  describe('ProposedAction interface', () => {
    it('represents a reversible action', () => {
      const action: ProposedAction = {
        id: 'action-1',
        actionType: ActionType.CREATE_BILL,
        targetSystem: TargetSystem.QUICKBOOKS,
        parameters: {
          vendorName: 'Acme Corp',
          amount: 1500.0,
          dueDate: '2024-02-01',
        },
        reversibility: Reversibility.FULL,
        compensation: {
          actionType: ActionType.DELETE_BILL,
          targetSystem: TargetSystem.QUICKBOOKS,
          parameters: { billId: '{{result.externalId}}' },
        },
        requiresApproval: false,
      };

      expect(action.reversibility).toBe('full');
      expect(action.compensation).toBeDefined();
      expect(action.requiresApproval).toBe(false);
    });

    it('represents an irreversible action requiring approval', () => {
      const action: ProposedAction = {
        id: 'action-2',
        actionType: ActionType.EXECUTE_PAYMENT,
        targetSystem: TargetSystem.BILLCOM,
        parameters: {
          paymentId: 'pay-123',
          amount: 10000.0,
        },
        reversibility: Reversibility.HARD_IRREVERSIBLE,
        requiresApproval: true,
      };

      expect(action.reversibility).toBe('hard_irreversible');
      expect(action.requiresApproval).toBe(true);
      expect(action.compensation).toBeUndefined();
    });
  });

  describe('ActionPlan interface', () => {
    it('contains multiple ordered actions', () => {
      const plan: ActionPlan = {
        emailId: 'email-123',
        actions: [
          {
            id: 'action-1',
            actionType: ActionType.CREATE_BILL,
            targetSystem: TargetSystem.QUICKBOOKS,
            parameters: { vendorName: 'Vendor', amount: 500 },
            reversibility: Reversibility.FULL,
            requiresApproval: false,
          },
          {
            id: 'action-2',
            actionType: ActionType.SCHEDULE_PAYMENT,
            targetSystem: TargetSystem.BILLCOM,
            parameters: { billId: '{{action-1.result.externalId}}', date: '2024-02-15' },
            reversibility: Reversibility.COMPENSATE,
            requiresApproval: true,
          },
        ],
        reasoning: 'Invoice received from known vendor with valid amount and due date',
      };

      expect(plan.actions).toHaveLength(2);
      expect(plan.reasoning).toBeDefined();
    });
  });

  describe('ActionResult interface', () => {
    it('represents successful execution', () => {
      const result: ActionResult = {
        success: true,
        externalId: 'qb-bill-456',
        data: {
          vendorId: 'vendor-123',
          transactionId: 'txn-789',
        },
      };

      expect(result.success).toBe(true);
      expect(result.externalId).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('represents failed execution', () => {
      const result: ActionResult = {
        success: false,
        error: 'Vendor not found in QuickBooks',
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('RuleViolation interface', () => {
    it('captures validation errors', () => {
      const violation: RuleViolation = {
        rule: 'max_amount_threshold',
        message: 'Amount $50,000 exceeds maximum single transaction limit of $25,000',
        severity: 'error',
      };

      expect(violation.severity).toBe('error');
    });

    it('captures warnings', () => {
      const violation: RuleViolation = {
        rule: 'low_confidence_extraction',
        message: 'Due date confidence below 80%',
        severity: 'warning',
      };

      expect(violation.severity).toBe('warning');
    });
  });

  describe('ValidationResult interface', () => {
    it('represents valid plan', () => {
      const result: ValidationResult = {
        valid: true,
        riskLevel: RiskLevel.LOW,
        requiresApproval: false,
        violations: [],
        warnings: [],
        appliedRules: ['known_vendor', 'amount_threshold', 'duplicate_check'],
      };

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('represents invalid plan with violations', () => {
      const result: ValidationResult = {
        valid: false,
        riskLevel: RiskLevel.CRITICAL,
        requiresApproval: true,
        violations: [
          {
            rule: 'max_amount',
            message: 'Amount exceeds limit',
            severity: 'error',
          },
        ],
        warnings: ['New vendor - first transaction'],
        appliedRules: ['max_amount', 'new_vendor_check'],
      };

      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.riskLevel).toBe('critical');
    });
  });

  describe('RiskAssessment interface', () => {
    it('provides detailed risk information', () => {
      const assessment: RiskAssessment = {
        level: RiskLevel.HIGH,
        reasons: [
          'First transaction with this vendor',
          'Amount is 3x higher than vendor average',
          'Due date is today',
        ],
        requiresApproval: true,
        appliedRules: ['new_vendor', 'amount_deviation', 'urgent_payment'],
        overrideAllowed: true,
      };

      expect(assessment.reasons).toHaveLength(3);
      expect(assessment.requiresApproval).toBe(true);
    });
  });

  describe('ActionDomain interface', () => {
    it('represents pending action', () => {
      const action: ActionDomain = {
        id: 'action-123',
        emailId: 'email-456',
        sagaId: 'saga-789',
        actionType: ActionType.CREATE_BILL,
        targetSystem: TargetSystem.QUICKBOOKS,
        parameters: { vendorName: 'Test', amount: 100 },
        riskLevel: RiskLevel.LOW,
        riskReasons: [],
        requiresApproval: false,
        status: ActionStatus.PENDING,
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
        executedAt: null,
        result: null,
        externalId: null,
        error: null,
        isCompensated: false,
        compensatedAt: null,
        compensationId: null,
      };

      expect(action.status).toBe('pending');
      expect(action.result).toBeNull();
    });

    it('represents completed action', () => {
      const action: ActionDomain = {
        id: 'action-completed',
        emailId: 'email-1',
        sagaId: null,
        actionType: ActionType.RECORD_PAYMENT,
        targetSystem: TargetSystem.QUICKBOOKS,
        parameters: { billId: 'bill-123', amount: 500 },
        riskLevel: RiskLevel.MEDIUM,
        riskReasons: ['Manual approval requested by client'],
        requiresApproval: true,
        status: ActionStatus.COMPLETED,
        approvedBy: 'user-admin',
        approvedAt: new Date('2024-01-15T10:00:00Z'),
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
        executedAt: new Date('2024-01-15T10:01:00Z'),
        result: { success: true, externalId: 'payment-789' },
        externalId: 'payment-789',
        error: null,
        isCompensated: false,
        compensatedAt: null,
        compensationId: null,
      };

      expect(action.status).toBe('completed');
      expect(action.result?.success).toBe(true);
      expect(action.approvedBy).toBeDefined();
    });

    it('represents compensated action', () => {
      const action: ActionDomain = {
        id: 'action-compensated',
        emailId: 'email-2',
        sagaId: 'saga-1',
        actionType: ActionType.CREATE_BILL,
        targetSystem: TargetSystem.QUICKBOOKS,
        parameters: { vendorName: 'Wrong Vendor', amount: 1000 },
        riskLevel: RiskLevel.LOW,
        riskReasons: [],
        requiresApproval: false,
        status: ActionStatus.COMPENSATED,
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
        executedAt: new Date('2024-01-14T09:00:00Z'),
        result: { success: true, externalId: 'bill-wrong' },
        externalId: 'bill-wrong',
        error: null,
        isCompensated: true,
        compensatedAt: new Date('2024-01-14T10:00:00Z'),
        compensationId: 'action-delete-wrong-bill',
      };

      expect(action.status).toBe('compensated');
      expect(action.isCompensated).toBe(true);
      expect(action.compensationId).toBeDefined();
    });
  });
});
