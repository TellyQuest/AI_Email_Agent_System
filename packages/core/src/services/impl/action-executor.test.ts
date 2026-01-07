import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from '@ai-email-agent/utils';
import { ActionExecutor } from './action-executor.js';
import { ActionDomain } from '../../types/action.js';

// Mock clients
const mockQuickbooks = {
  findVendorByName: vi.fn(),
  createVendor: vi.fn(),
  createBill: vi.fn(),
  deleteBill: vi.fn(),
  createBillPayment: vi.fn(),
};

const mockBillcom = {
  findVendorByName: vi.fn(),
  createVendor: vi.fn(),
  createBill: vi.fn(),
  deleteBill: vi.fn(),
  schedulePayment: vi.fn(),
  voidPayment: vi.fn(),
};

const createAction = (overrides: Partial<ActionDomain> = {}): ActionDomain => ({
  id: 'action-123',
  emailId: 'email-123',
  sagaId: null,
  actionType: 'create_bill',
  targetSystem: 'quickbooks',
  parameters: {
    vendorName: 'Acme Corp',
    amount: '1500.00',
    currency: 'USD',
    dueDate: '2024-01-30',
    invoiceNumber: 'INV-12345',
    description: 'Monthly services',
    emailId: 'email-123',
  },
  riskLevel: 'low',
  riskReasons: [],
  requiresApproval: false,
  status: 'pending',
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
  ...overrides,
});

describe('ActionExecutor', () => {
  let executor: ActionExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    executor = new ActionExecutor(mockQuickbooks as any, mockBillcom as any);
  });

  describe('canExecute', () => {
    it('should return true for pending actions', () => {
      const action = createAction({ status: 'pending' });
      expect(executor.canExecute(action)).toBe(true);
    });

    it('should return true for approved actions', () => {
      const action = createAction({ status: 'approved' });
      expect(executor.canExecute(action)).toBe(true);
    });

    it('should return false for completed actions', () => {
      const action = createAction({ status: 'completed' });
      expect(executor.canExecute(action)).toBe(false);
    });

    it('should return false for failed actions', () => {
      const action = createAction({ status: 'failed' });
      expect(executor.canExecute(action)).toBe(false);
    });

    it('should return false for pending actions that require approval', () => {
      const action = createAction({ status: 'pending', requiresApproval: true });
      expect(executor.canExecute(action)).toBe(false);
    });

    it('should return true for approval-required actions when skipApprovalCheck is set', () => {
      const executorWithSkip = new ActionExecutor(
        mockQuickbooks as any,
        mockBillcom as any,
        { skipApprovalCheck: true }
      );
      const action = createAction({ status: 'pending', requiresApproval: true });
      expect(executorWithSkip.canExecute(action)).toBe(true);
    });
  });

  describe('execute - QuickBooks', () => {
    it('should create a bill with existing vendor', async () => {
      const existingVendor = { Id: 'vendor-123', DisplayName: 'Acme Corp' };
      mockQuickbooks.findVendorByName.mockResolvedValue(ok(existingVendor));
      mockQuickbooks.createBill.mockResolvedValue(ok({ Id: 'bill-123', TotalAmt: 1500 }));

      const action = createAction();
      const result = await executor.execute(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(true);
        expect(result.value.externalId).toBe('bill-123');
      }
      expect(mockQuickbooks.createVendor).not.toHaveBeenCalled();
    });

    it('should create vendor if not found', async () => {
      mockQuickbooks.findVendorByName.mockResolvedValue(ok(null));
      mockQuickbooks.createVendor.mockResolvedValue(ok({ Id: 'new-vendor-123' }));
      mockQuickbooks.createBill.mockResolvedValue(ok({ Id: 'bill-123', TotalAmt: 1500 }));

      const action = createAction();
      const result = await executor.execute(action);

      expect(result.ok).toBe(true);
      expect(mockQuickbooks.createVendor).toHaveBeenCalledWith({
        DisplayName: 'Acme Corp',
        CompanyName: 'Acme Corp',
      });
    });

    it('should handle vendor lookup errors', async () => {
      mockQuickbooks.findVendorByName.mockResolvedValue(
        err({ code: 'API_ERROR', message: 'QuickBooks unavailable', statusCode: 503 })
      );

      const action = createAction();
      const result = await executor.execute(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('EXTERNAL_API_ERROR');
      }
    });

    it('should handle bill creation errors', async () => {
      mockQuickbooks.findVendorByName.mockResolvedValue(ok({ Id: 'vendor-123' }));
      mockQuickbooks.createBill.mockResolvedValue(
        err({ code: 'VALIDATION_ERROR', message: 'Invalid amount', statusCode: 400 })
      );

      const action = createAction();
      const result = await executor.execute(action);

      expect(result.ok).toBe(false);
    });

    it('should delete a bill', async () => {
      mockQuickbooks.deleteBill.mockResolvedValue(ok(undefined));

      const action = createAction({
        actionType: 'delete_bill',
        parameters: { billId: 'bill-123', syncToken: '1' },
      });
      const result = await executor.execute(action);

      expect(result.ok).toBe(true);
      expect(mockQuickbooks.deleteBill).toHaveBeenCalledWith('bill-123', '1');
    });

    it('should record a payment', async () => {
      mockQuickbooks.createBillPayment.mockResolvedValue(ok({ Id: 'payment-123' }));

      const action = createAction({
        actionType: 'record_payment',
        parameters: { amount: '1500.00', billId: 'bill-123' },
      });
      const result = await executor.execute(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.externalId).toBe('payment-123');
      }
    });
  });

  describe('execute - Bill.com', () => {
    it('should create a bill on Bill.com', async () => {
      mockBillcom.findVendorByName.mockResolvedValue(ok({ id: 'vendor-bc-123' }));
      mockBillcom.createBill.mockResolvedValue(ok({ id: 'bill-bc-123' }));

      const action = createAction({ targetSystem: 'billcom' });
      const result = await executor.execute(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.externalId).toBe('bill-bc-123');
      }
    });

    it('should create vendor on Bill.com if not found', async () => {
      mockBillcom.findVendorByName.mockResolvedValue(ok(null));
      mockBillcom.createVendor.mockResolvedValue(ok({ id: 'new-vendor-bc' }));
      mockBillcom.createBill.mockResolvedValue(ok({ id: 'bill-bc-123' }));

      const action = createAction({ targetSystem: 'billcom' });
      const result = await executor.execute(action);

      expect(result.ok).toBe(true);
      expect(mockBillcom.createVendor).toHaveBeenCalledWith({
        name: 'Acme Corp',
        isActive: true,
      });
    });

    it('should schedule a payment on Bill.com', async () => {
      mockBillcom.schedulePayment.mockResolvedValue(ok({ id: 'payment-bc-123' }));

      const action = createAction({
        targetSystem: 'billcom',
        actionType: 'schedule_payment',
        parameters: {
          billId: 'bill-bc-123',
          vendorId: 'vendor-bc-123',
          amount: '1500.00',
          processDate: '2024-01-30',
          paymentType: 'ACH',
        },
      });
      const result = await executor.execute(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.externalId).toBe('payment-bc-123');
      }
    });
  });

  describe('execute - Internal', () => {
    it('should handle internal actions', async () => {
      const action = createAction({
        targetSystem: 'internal',
        actionType: 'reconcile',
      });
      const result = await executor.execute(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.data).toEqual({ recorded: true });
      }
    });
  });

  describe('execute - Dry run', () => {
    it('should not execute in dry run mode', async () => {
      const dryRunExecutor = new ActionExecutor(
        mockQuickbooks as any,
        mockBillcom as any,
        { dryRun: true }
      );

      const action = createAction();
      const result = await dryRunExecutor.execute(action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.data).toEqual({ dryRun: true });
      }
      expect(mockQuickbooks.findVendorByName).not.toHaveBeenCalled();
    });
  });

  describe('execute - Invalid state', () => {
    it('should reject actions in invalid state', async () => {
      const action = createAction({ status: 'completed' });
      const result = await executor.execute(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_STATE');
      }
    });

    it('should reject unknown target system', async () => {
      const action = createAction({ targetSystem: 'unknown' as any });
      const result = await executor.execute(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_STATE');
      }
    });

    it('should reject unsupported action types', async () => {
      const action = createAction({ actionType: 'unknown_action' as any });
      const result = await executor.execute(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ACTION_FAILED');
      }
    });
  });

  describe('compensate', () => {
    it('should compensate a QuickBooks bill creation', async () => {
      mockQuickbooks.deleteBill.mockResolvedValue(ok(undefined));

      const action = createAction({
        status: 'completed',
        externalId: 'bill-123',
      });
      const result = await executor.compensate(action);

      expect(result.ok).toBe(true);
      // Default syncToken is '0' when not provided in parameters
      expect(mockQuickbooks.deleteBill).toHaveBeenCalledWith('bill-123', '0');
    });

    it('should compensate a Bill.com bill creation', async () => {
      mockBillcom.deleteBill.mockResolvedValue(ok(undefined));

      const action = createAction({
        targetSystem: 'billcom',
        status: 'completed',
        externalId: 'bill-bc-123',
      });
      const result = await executor.compensate(action);

      expect(result.ok).toBe(true);
      expect(mockBillcom.deleteBill).toHaveBeenCalledWith('bill-bc-123');
    });

    it('should compensate a Bill.com payment', async () => {
      mockBillcom.voidPayment.mockResolvedValue(ok(undefined));

      const action = createAction({
        targetSystem: 'billcom',
        actionType: 'schedule_payment',
        status: 'completed',
        externalId: 'payment-bc-123',
      });
      const result = await executor.compensate(action);

      expect(result.ok).toBe(true);
      expect(mockBillcom.voidPayment).toHaveBeenCalledWith('payment-bc-123');
    });

    it('should reject compensation for non-completed actions', async () => {
      const action = createAction({ status: 'pending' });
      const result = await executor.compensate(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_STATE');
      }
    });

    it('should reject compensation without external ID', async () => {
      const action = createAction({ status: 'completed', externalId: undefined });
      const result = await executor.compensate(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('COMPENSATION_FAILED');
      }
    });

    it('should reject compensation for unsupported action types', async () => {
      const action = createAction({
        actionType: 'reconcile',
        status: 'completed',
        externalId: 'ext-123',
      });
      const result = await executor.compensate(action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('COMPENSATION_FAILED');
      }
    });
  });
});
