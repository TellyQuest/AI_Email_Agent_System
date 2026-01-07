import { Result, ok, err, createLogger } from '@ai-email-agent/utils';
import { EmailDomain, ExtractedData, EmailType } from '../../types/email.js';
import { ClientDomain } from '../../types/client.js';
import {
  ActionPlan,
  ProposedAction,
  ActionType,
  TargetSystem,
  Reversibility,
} from '../../types/action.js';
import { IPlannerService, PlanError, PlanErrorCode, PlanOptions } from '../planner.js';

const logger = createLogger({ service: 'planner-service' });

/**
 * Generate a unique action ID
 */
function generateActionId(): string {
  return `action-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Service implementation for generating action plans based on email data
 *
 * This implementation uses rule-based planning for predictable, auditable actions.
 * For more complex scenarios, an LLM-based approach could be added.
 */
export class PlannerService implements IPlannerService {
  constructor(private options: PlanOptions = {}) {}

  /**
   * Generate an action plan based on extracted email data
   */
  async plan(
    email: EmailDomain,
    extractedData: ExtractedData,
    client: ClientDomain | null
  ): Promise<Result<ActionPlan, PlanError>> {
    logger.info(
      {
        emailId: email.id,
        emailType: email.classification?.emailType,
        hasClient: !!client,
        confidence: extractedData.overallConfidence,
      },
      'Planning actions for email'
    );

    const emailType = email.classification?.emailType;
    if (!emailType) {
      return err({
        code: PlanErrorCode.INVALID_DATA,
        message: 'Email must be classified before planning',
        details: { emailId: email.id },
      });
    }

    // Determine target system based on client configuration
    const targetSystem = this.determineTargetSystem(client);

    // Generate actions based on email type
    let actions: ProposedAction[];
    let reasoning: string;

    switch (emailType) {
      case 'invoice':
        ({ actions, reasoning } = this.planInvoiceActions(
          email,
          extractedData,
          client,
          targetSystem
        ));
        break;

      case 'receipt':
        ({ actions, reasoning } = this.planReceiptActions(
          email,
          extractedData,
          client,
          targetSystem
        ));
        break;

      case 'payment_notice':
        ({ actions, reasoning } = this.planPaymentNoticeActions(
          email,
          extractedData,
          client,
          targetSystem
        ));
        break;

      case 'bank_notice':
        ({ actions, reasoning } = this.planBankNoticeActions(email, extractedData, client));
        break;

      case 'inquiry':
        // Inquiries don't generate automated actions
        actions = [];
        reasoning = 'Email is an inquiry requiring human response. No automated actions planned.';
        break;

      case 'irrelevant':
        actions = [];
        reasoning = 'Email classified as irrelevant. No actions needed.';
        break;

      default:
        return err({
          code: PlanErrorCode.UNKNOWN_ACTION_TYPE,
          message: `Unknown email type: ${emailType}`,
          details: { emailType },
        });
    }

    // Filter by allowed action types if specified
    if (this.options.allowedActionTypes?.length) {
      actions = actions.filter((a) =>
        this.options.allowedActionTypes!.includes(a.actionType)
      );
    }

    if (actions.length === 0 && emailType !== 'inquiry' && emailType !== 'irrelevant') {
      logger.warn({ emailId: email.id, emailType }, 'No actions generated for email');
    }

    logger.info(
      { emailId: email.id, actionCount: actions.length },
      'Action plan generated'
    );

    return ok({
      emailId: email.id,
      actions,
      reasoning,
    });
  }

  /**
   * Determine target system based on client configuration
   */
  private determineTargetSystem(client: ClientDomain | null): TargetSystem {
    if (!client) {
      return 'quickbooks'; // Default
    }

    // Prefer QuickBooks if connected, otherwise Bill.com
    if (client.quickbooksId) {
      return 'quickbooks';
    }
    if (client.billcomId) {
      return 'billcom';
    }
    return 'quickbooks';
  }

  /**
   * Plan actions for invoice emails
   */
  private planInvoiceActions(
    email: EmailDomain,
    data: ExtractedData,
    client: ClientDomain | null,
    targetSystem: TargetSystem
  ): { actions: ProposedAction[]; reasoning: string } {
    const actions: ProposedAction[] = [];
    const reasons: string[] = [];

    // Create bill action
    if (data.vendorName.value && data.amount.value) {
      const amount = parseFloat(data.amount.value);
      const requiresApproval = this.shouldRequireApproval(amount, data, client);

      actions.push({
        id: generateActionId(),
        actionType: 'create_bill',
        targetSystem,
        parameters: {
          vendorName: data.vendorName.value,
          amount: data.amount.value,
          currency: data.currency.value ?? 'USD',
          dueDate: data.dueDate.value,
          invoiceNumber: data.invoiceNumber.value,
          description: data.description.value ?? `Invoice from ${data.vendorName.value}`,
          lineItems: data.lineItems,
          emailId: email.id,
        },
        reversibility: 'compensate',
        compensation: {
          actionType: 'delete_bill',
          targetSystem,
          parameters: {}, // Will be filled with billId after execution
        },
        requiresApproval,
      });

      reasons.push(
        `Create bill for $${data.amount.value} from ${data.vendorName.value}` +
          (requiresApproval ? ' (requires approval)' : '')
      );

      // Schedule payment if due date is provided and client allows auto-payment
      if (data.dueDate.value && targetSystem === 'billcom' && !requiresApproval) {
        actions.push({
          id: generateActionId(),
          actionType: 'schedule_payment',
          targetSystem: 'billcom',
          parameters: {
            vendorName: data.vendorName.value,
            amount: data.amount.value,
            processDate: data.dueDate.value,
            paymentType: 'ACH',
          },
          reversibility: 'compensate',
          compensation: {
            actionType: 'delete_bill', // Void payment
            targetSystem: 'billcom',
            parameters: {},
          },
          requiresApproval: true, // Payments always require approval
        });
        reasons.push(`Schedule payment for ${data.dueDate.value} (requires approval)`);
      }
    } else {
      reasons.push('Insufficient data to create bill - missing vendor or amount');
    }

    return {
      actions,
      reasoning: reasons.join('. '),
    };
  }

  /**
   * Plan actions for receipt emails
   */
  private planReceiptActions(
    email: EmailDomain,
    data: ExtractedData,
    client: ClientDomain | null,
    targetSystem: TargetSystem
  ): { actions: ProposedAction[]; reasoning: string } {
    const actions: ProposedAction[] = [];
    const reasons: string[] = [];

    // Record payment action
    if (data.vendorName.value && data.amount.value) {
      actions.push({
        id: generateActionId(),
        actionType: 'record_payment',
        targetSystem,
        parameters: {
          vendorName: data.vendorName.value,
          amount: data.amount.value,
          currency: data.currency.value ?? 'USD',
          paymentDate: new Date().toISOString().split('T')[0],
          referenceNumber: data.invoiceNumber.value,
          description: data.description.value ?? `Payment to ${data.vendorName.value}`,
          emailId: email.id,
        },
        reversibility: 'soft_irreversible',
        requiresApproval: false, // Receipts are confirmations, lower risk
      });

      reasons.push(`Record payment of $${data.amount.value} to ${data.vendorName.value}`);
    } else {
      reasons.push('Insufficient data to record payment - missing vendor or amount');
    }

    return {
      actions,
      reasoning: reasons.join('. '),
    };
  }

  /**
   * Plan actions for payment notice emails
   */
  private planPaymentNoticeActions(
    email: EmailDomain,
    data: ExtractedData,
    client: ClientDomain | null,
    targetSystem: TargetSystem
  ): { actions: ProposedAction[]; reasoning: string } {
    const actions: ProposedAction[] = [];
    const reasons: string[] = [];

    // Reconcile payment
    if (data.vendorName.value && data.amount.value) {
      actions.push({
        id: generateActionId(),
        actionType: 'reconcile',
        targetSystem: 'internal',
        parameters: {
          vendorName: data.vendorName.value,
          amount: data.amount.value,
          referenceNumber: data.invoiceNumber.value,
          noticeDate: new Date().toISOString().split('T')[0],
          emailId: email.id,
        },
        reversibility: 'full',
        requiresApproval: false,
      });

      reasons.push(`Reconcile payment notice from ${data.vendorName.value}`);
    } else {
      reasons.push('Payment notice recorded for review - missing specific details');
    }

    return {
      actions,
      reasoning: reasons.join('. '),
    };
  }

  /**
   * Plan actions for bank notice emails
   */
  private planBankNoticeActions(
    email: EmailDomain,
    data: ExtractedData,
    client: ClientDomain | null
  ): { actions: ProposedAction[]; reasoning: string } {
    // Bank notices are typically for review, no automated actions
    return {
      actions: [],
      reasoning: 'Bank notice received. Manual review recommended - no automated actions.',
    };
  }

  /**
   * Determine if an action should require approval
   */
  private shouldRequireApproval(
    amount: number,
    data: ExtractedData,
    client: ClientDomain | null
  ): boolean {
    // Always require approval for high amounts
    if (amount >= 10000) return true;

    // Require approval for medium amounts with low confidence
    if (amount >= 1000 && data.overallConfidence < 0.8) return true;

    // Check client-specific threshold
    if (client?.approvalThreshold) {
      if (amount >= client.approvalThreshold) return true;
    }

    // Check auto-approve vendors
    if (client?.autoApproveVendors?.length && data.vendorName.value) {
      const isAutoApproved = client.autoApproveVendors.some(
        (v) => v.toLowerCase() === data.vendorName.value?.toLowerCase()
      );
      if (isAutoApproved) return false;
    }

    // Default threshold
    return amount >= 5000;
  }
}

/**
 * Create a planner service instance
 */
export function createPlannerService(options?: PlanOptions): PlannerService {
  return new PlannerService(options);
}
