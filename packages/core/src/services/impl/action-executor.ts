import { Result, ok, err, createLogger } from '@ai-email-agent/utils';
import {
  QuickBooksClient,
  BillComClient,
  QuickBooksError,
  BillComError,
} from '@ai-email-agent/integrations';
import {
  ActionDomain,
  ActionResult,
  ActionStatus,
  TargetSystem,
} from '../../types/action.js';
import {
  IActionExecutor,
  ExecutorError,
  ExecutorErrorCode,
  ExecutionOptions,
} from '../executor.js';

const logger = createLogger({ service: 'action-executor' });

/**
 * Map external errors to executor errors
 */
function mapQuickBooksError(error: QuickBooksError): ExecutorError {
  return {
    code: ExecutorErrorCode.EXTERNAL_API_ERROR,
    message: error.message,
    details: { statusCode: error.statusCode, fault: error.fault },
  };
}

function mapBillComError(error: BillComError): ExecutorError {
  return {
    code: ExecutorErrorCode.EXTERNAL_API_ERROR,
    message: error.message,
    details: { statusCode: error.statusCode },
  };
}

/**
 * Service implementation for executing actions against external systems
 */
export class ActionExecutor implements IActionExecutor {
  constructor(
    private quickbooks: QuickBooksClient,
    private billcom: BillComClient,
    private options: ExecutionOptions = {}
  ) {}

  /**
   * Execute a single action
   */
  async execute(action: ActionDomain): Promise<Result<ActionResult, ExecutorError>> {
    logger.info(
      {
        actionId: action.id,
        type: action.actionType,
        system: action.targetSystem,
      },
      'Executing action'
    );

    // Check if action can be executed
    if (!this.canExecute(action)) {
      return err({
        code: ExecutorErrorCode.INVALID_STATE,
        message: `Action cannot be executed in state: ${action.status}`,
        details: { actionId: action.id, status: action.status },
      });
    }

    // Dry run mode
    if (this.options.dryRun) {
      logger.info({ actionId: action.id }, 'Dry run - action not executed');
      return ok({
        success: true,
        data: { dryRun: true },
      });
    }

    // Route to appropriate handler
    switch (action.targetSystem) {
      case 'quickbooks':
        return this.executeQuickBooks(action);
      case 'billcom':
        return this.executeBillCom(action);
      case 'internal':
        return this.executeInternal(action);
      default:
        return err({
          code: ExecutorErrorCode.INVALID_STATE,
          message: `Unknown target system: ${action.targetSystem}`,
        });
    }
  }

  /**
   * Execute compensation for a failed action
   */
  async compensate(action: ActionDomain): Promise<Result<ActionResult, ExecutorError>> {
    logger.info(
      { actionId: action.id, type: action.actionType },
      'Compensating action'
    );

    // Can only compensate completed actions
    if (action.status !== 'completed') {
      return err({
        code: ExecutorErrorCode.INVALID_STATE,
        message: `Cannot compensate action in state: ${action.status}`,
        details: { actionId: action.id },
      });
    }

    if (!action.externalId) {
      return err({
        code: ExecutorErrorCode.COMPENSATION_FAILED,
        message: 'No external ID to compensate',
        details: { actionId: action.id },
      });
    }

    // Route compensation based on action type
    switch (action.actionType) {
      case 'create_bill':
        return this.compensateCreateBill(action);
      case 'schedule_payment':
        return this.compensateSchedulePayment(action);
      default:
        return err({
          code: ExecutorErrorCode.COMPENSATION_FAILED,
          message: `No compensation available for action type: ${action.actionType}`,
        });
    }
  }

  /**
   * Check if an action can be executed
   */
  canExecute(action: ActionDomain): boolean {
    // Must be pending or approved
    if (action.status !== 'pending' && action.status !== 'approved') {
      return false;
    }

    // If requires approval, must be approved
    if (action.requiresApproval && action.status !== 'approved') {
      if (!this.options.skipApprovalCheck) {
        return false;
      }
    }

    return true;
  }

  // QuickBooks handlers
  private async executeQuickBooks(action: ActionDomain): Promise<Result<ActionResult, ExecutorError>> {
    const params = action.parameters;

    switch (action.actionType) {
      case 'create_bill':
        return this.createQuickBooksBill(params);
      case 'delete_bill':
        return this.deleteQuickBooksBill(params);
      case 'record_payment':
        return this.recordQuickBooksPayment(params);
      default:
        return err({
          code: ExecutorErrorCode.ACTION_FAILED,
          message: `Unsupported QuickBooks action: ${action.actionType}`,
        });
    }
  }

  private async createQuickBooksBill(
    params: Record<string, unknown>
  ): Promise<Result<ActionResult, ExecutorError>> {
    // Find or create vendor
    const vendorName = params['vendorName'] as string;
    let vendorResult = await this.quickbooks.findVendorByName(vendorName);

    if (!vendorResult.ok) {
      return err(mapQuickBooksError(vendorResult.error));
    }

    let vendorId: string;
    if (!vendorResult.value) {
      // Create vendor
      const createResult = await this.quickbooks.createVendor({
        DisplayName: vendorName,
        CompanyName: vendorName,
      });
      if (!createResult.ok) {
        return err(mapQuickBooksError(createResult.error));
      }
      vendorId = createResult.value.Id;
    } else {
      vendorId = vendorResult.value.Id;
    }

    // Build line items
    const lineItems = (params['lineItems'] as Array<{ description: string; amount: string }>) ?? [];
    const amount = parseFloat(params['amount'] as string);

    const qbLines = lineItems.length > 0
      ? lineItems.map((item, idx) => ({
          Amount: parseFloat(item.amount),
          DetailType: 'AccountBasedExpenseLineDetail' as const,
          Description: item.description,
          AccountBasedExpenseLineDetail: {
            AccountRef: { value: '1', name: 'Expenses' }, // Default account
          },
        }))
      : [{
          Amount: amount,
          DetailType: 'AccountBasedExpenseLineDetail' as const,
          Description: params['description'] as string ?? 'Invoice payment',
          AccountBasedExpenseLineDetail: {
            AccountRef: { value: '1', name: 'Expenses' },
          },
        }];

    // Create bill
    const billResult = await this.quickbooks.createBill({
      VendorRef: { value: vendorId, name: vendorName },
      TxnDate: new Date().toISOString().split('T')[0]!,
      DueDate: params['dueDate'] as string,
      TotalAmt: amount,
      Balance: amount,
      DocNumber: params['invoiceNumber'] as string,
      Line: qbLines,
      PrivateNote: `Created from email ${params['emailId']}`,
    });

    if (!billResult.ok) {
      return err(mapQuickBooksError(billResult.error));
    }

    logger.info({ billId: billResult.value.Id }, 'QuickBooks bill created');

    return ok({
      success: true,
      externalId: billResult.value.Id,
      data: { vendorId, totalAmount: billResult.value.TotalAmt },
    });
  }

  private async deleteQuickBooksBill(
    params: Record<string, unknown>
  ): Promise<Result<ActionResult, ExecutorError>> {
    const billId = params['billId'] as string;
    const syncToken = params['syncToken'] as string ?? '0';

    const result = await this.quickbooks.deleteBill(billId, syncToken);

    if (!result.ok) {
      return err(mapQuickBooksError(result.error));
    }

    return ok({
      success: true,
      externalId: billId,
      data: { deleted: true },
    });
  }

  private async recordQuickBooksPayment(
    params: Record<string, unknown>
  ): Promise<Result<ActionResult, ExecutorError>> {
    const amount = parseFloat(params['amount'] as string);
    const billId = params['billId'] as string;

    const result = await this.quickbooks.createBillPayment({
      TotalAmt: amount,
      TxnDate: (params['paymentDate'] as string) ?? new Date().toISOString().split('T')[0]!,
      Line: billId ? [{
        Amount: amount,
        LinkedTxn: [{ TxnId: billId, TxnType: 'Bill' }],
      }] : [],
    });

    if (!result.ok) {
      return err(mapQuickBooksError(result.error));
    }

    return ok({
      success: true,
      externalId: result.value.Id,
      data: { amount },
    });
  }

  // Bill.com handlers
  private async executeBillCom(action: ActionDomain): Promise<Result<ActionResult, ExecutorError>> {
    const params = action.parameters;

    switch (action.actionType) {
      case 'create_bill':
        return this.createBillComBill(params);
      case 'schedule_payment':
        return this.scheduleBillComPayment(params);
      default:
        return err({
          code: ExecutorErrorCode.ACTION_FAILED,
          message: `Unsupported Bill.com action: ${action.actionType}`,
        });
    }
  }

  private async createBillComBill(
    params: Record<string, unknown>
  ): Promise<Result<ActionResult, ExecutorError>> {
    // Find or create vendor
    const vendorName = params['vendorName'] as string;
    let vendorResult = await this.billcom.findVendorByName(vendorName);

    if (!vendorResult.ok) {
      return err(mapBillComError(vendorResult.error));
    }

    let vendorId: string;
    if (!vendorResult.value) {
      const createResult = await this.billcom.createVendor({
        name: vendorName,
        isActive: true,
      });
      if (!createResult.ok) {
        return err(mapBillComError(createResult.error));
      }
      vendorId = createResult.value.id;
    } else {
      vendorId = vendorResult.value.id;
    }

    const amount = parseFloat(params['amount'] as string);
    const lineItems = (params['lineItems'] as Array<{ description: string; amount: string }>) ?? [];

    const bcLines = lineItems.length > 0
      ? lineItems.map((item) => ({
          amount: parseFloat(item.amount),
          description: item.description,
        }))
      : [{ amount, description: params['description'] as string ?? 'Invoice' }];

    const billResult = await this.billcom.createBill({
      vendorId,
      invoiceNumber: params['invoiceNumber'] as string,
      invoiceDate: new Date().toISOString().split('T')[0]!,
      dueDate: (params['dueDate'] as string) ?? new Date().toISOString().split('T')[0]!,
      amount,
      amountDue: amount,
      description: params['description'] as string,
      lineItems: bcLines,
    });

    if (!billResult.ok) {
      return err(mapBillComError(billResult.error));
    }

    logger.info({ billId: billResult.value.id }, 'Bill.com bill created');

    return ok({
      success: true,
      externalId: billResult.value.id,
      data: { vendorId, totalAmount: amount },
    });
  }

  private async scheduleBillComPayment(
    params: Record<string, unknown>
  ): Promise<Result<ActionResult, ExecutorError>> {
    const billId = params['billId'] as string;
    const vendorId = params['vendorId'] as string;
    const amount = parseFloat(params['amount'] as string);
    const processDate = params['processDate'] as string;
    const paymentType = params['paymentType'] as 'Check' | 'ACH' | 'PayPal' | 'VendorCredit' ?? 'ACH';

    const result = await this.billcom.schedulePayment(
      billId,
      vendorId,
      amount,
      processDate,
      paymentType
    );

    if (!result.ok) {
      return err(mapBillComError(result.error));
    }

    return ok({
      success: true,
      externalId: result.value.id,
      data: { amount, processDate },
    });
  }

  // Internal handlers
  private async executeInternal(action: ActionDomain): Promise<Result<ActionResult, ExecutorError>> {
    // Internal actions like reconciliation just log and succeed
    logger.info(
      { actionId: action.id, type: action.actionType, params: action.parameters },
      'Internal action recorded'
    );

    return ok({
      success: true,
      data: { recorded: true },
    });
  }

  // Compensation handlers
  private async compensateCreateBill(action: ActionDomain): Promise<Result<ActionResult, ExecutorError>> {
    if (action.targetSystem === 'quickbooks') {
      return this.deleteQuickBooksBill({ billId: action.externalId });
    }

    if (action.targetSystem === 'billcom') {
      const result = await this.billcom.deleteBill(action.externalId!);
      if (!result.ok) {
        return err(mapBillComError(result.error));
      }
      return ok({ success: true, externalId: action.externalId! });
    }

    return err({
      code: ExecutorErrorCode.COMPENSATION_FAILED,
      message: `No compensation for target system: ${action.targetSystem}`,
    });
  }

  private async compensateSchedulePayment(action: ActionDomain): Promise<Result<ActionResult, ExecutorError>> {
    if (action.targetSystem === 'billcom') {
      const result = await this.billcom.voidPayment(action.externalId!);
      if (!result.ok) {
        return err(mapBillComError(result.error));
      }
      return ok({ success: true, externalId: action.externalId! });
    }

    return err({
      code: ExecutorErrorCode.COMPENSATION_FAILED,
      message: `No compensation for payment on system: ${action.targetSystem}`,
    });
  }
}

/**
 * Create an action executor instance
 */
export function createActionExecutor(
  quickbooks?: QuickBooksClient,
  billcom?: BillComClient,
  options?: ExecutionOptions
): ActionExecutor {
  const { quickbooksClient, billcomClient } = require('@ai-email-agent/integrations');
  return new ActionExecutor(
    quickbooks ?? quickbooksClient,
    billcom ?? billcomClient,
    options
  );
}
