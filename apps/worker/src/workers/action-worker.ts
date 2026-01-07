import { PgBoss, Job } from 'pg-boss';
import { createLogger } from '@ai-email-agent/utils';
import { actionRepository, auditRepository } from '@ai-email-agent/database';
import { quickbooksClient, billcomClient } from '@ai-email-agent/integrations';
import { ActionResult } from '@ai-email-agent/core';

const logger = createLogger({ service: 'action-worker' });

interface ActionJob {
  actionId: string;
}

export const ACTION_QUEUE = 'action-execution';

export async function registerActionWorker(boss: PgBoss): Promise<void> {
  await boss.work<ActionJob>(
    ACTION_QUEUE,
    { batchSize: 5, pollingIntervalSeconds: 2 },
    async (jobs: Job<ActionJob>[]) => {
      for (const job of jobs) {
        const { actionId } = job.data;
        logger.info({ jobId: job.id, actionId }, 'Executing action');

        try {
          await executeAction(actionId);
        } catch (error) {
          logger.error({ error, actionId }, 'Failed to execute action');
          throw error;
        }
      }
    }
  );

  logger.info('Action worker registered');
}

async function executeAction(actionId: string) {
  // 1. Get action with context
  const actionResult = await actionRepository.findByIdWithContext(actionId);
  if (!actionResult.ok) {
    throw new Error(`Failed to fetch action: ${actionResult.error.message}`);
  }

  const action = actionResult.value;
  if (!action) {
    throw new Error(`Action not found: ${actionId}`);
  }

  // 2. Check action can be executed
  if (action.status !== 'pending' && action.status !== 'approved') {
    logger.warn({ actionId, status: action.status }, 'Action not in executable state');
    return { status: 'skipped', reason: `Action in status: ${action.status}` };
  }

  if (action.requiresApproval && action.status !== 'approved') {
    logger.warn({ actionId }, 'Action requires approval but not approved');
    return { status: 'skipped', reason: 'Requires approval' };
  }

  // 3. Update status to executing
  await actionRepository.updateStatus(actionId, 'executing');

  // 4. Execute based on action type and target system
  let result: ActionResult;
  let externalId: string | undefined;

  switch (action.targetSystem) {
    case 'quickbooks':
      ({ result, externalId } = await executeQuickBooksAction(
        action.actionType,
        action.parameters
      ));
      break;
    case 'billcom':
      ({ result, externalId } = await executeBillComAction(
        action.actionType,
        action.parameters
      ));
      break;
    default:
      result = { success: false, error: `Unknown target system: ${action.targetSystem}` };
  }

  // 5. Update action with result
  await actionRepository.markExecuted(actionId, result, externalId);

  // 6. Log audit
  await auditRepository.logActionEvent(
    result.success ? 'action.executed' : 'action.failed',
    actionId,
    action.emailId,
    result.success
      ? `Action ${action.actionType} executed successfully (external ID: ${externalId})`
      : `Action ${action.actionType} failed: ${result.error}`,
    { metadata: { result, externalId } }
  );

  if (result.success) {
    logger.info({ actionId, externalId }, 'Action executed successfully');
  } else {
    logger.error({ actionId, error: result.error }, 'Action execution failed');
  }

  return { status: result.success ? 'completed' : 'failed', externalId, error: result.error };
}

async function executeQuickBooksAction(
  actionType: string,
  params: Record<string, unknown>
): Promise<{ result: ActionResult; externalId?: string }> {
  try {
    switch (actionType) {
      case 'create_bill': {
        // First, find or create vendor
        let vendorId: string;
        const vendorName = String(params['vendorName'] ?? '');
        const amountStr = String(params['amount'] ?? '0');
        const dueDate = String(params['dueDate'] ?? new Date().toISOString().split('T')[0]);
        const invoiceNumber = String(params['invoiceNumber'] ?? '');

        const vendorResult = await quickbooksClient.findVendorByName(vendorName);
        if (!vendorResult.ok) {
          return {
            result: { success: false, error: `Failed to find vendor: ${vendorResult.error.message}` },
          };
        }

        if (vendorResult.value) {
          vendorId = vendorResult.value.Id;
        } else {
          // Create vendor
          const createVendorResult = await quickbooksClient.createVendor({
            DisplayName: vendorName,
          });
          if (!createVendorResult.ok) {
            return {
              result: { success: false, error: `Failed to create vendor: ${createVendorResult.error.message}` },
            };
          }
          vendorId = createVendorResult.value.Id;
        }

        // Create bill
        const amount = parseFloat(amountStr);
        const txnDate = new Date().toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10);
        const billResult = await quickbooksClient.createBill({
          VendorRef: { value: vendorId, name: vendorName },
          TxnDate: txnDate,
          DueDate: dueDate,
          TotalAmt: amount,
          Balance: amount,
          DocNumber: invoiceNumber,
          Line: [
            {
              Amount: amount,
              DetailType: 'AccountBasedExpenseLineDetail',
              Description: `Invoice ${invoiceNumber}`,
              AccountBasedExpenseLineDetail: {
                AccountRef: { value: '1', name: 'Expenses' },
              },
            },
          ],
        });

        if (!billResult.ok) {
          return {
            result: { success: false, error: `Failed to create bill: ${billResult.error.message}` },
          };
        }

        return {
          result: {
            success: true,
            externalId: billResult.value.Id,
            data: { vendorId, billId: billResult.value.Id },
          },
          externalId: billResult.value.Id,
        };
      }

      case 'record_payment': {
        return {
          result: { success: false, error: 'record_payment not yet implemented' },
        };
      }

      default:
        return {
          result: { success: false, error: `Unknown QuickBooks action: ${actionType}` },
        };
    }
  } catch (error) {
    return {
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function executeBillComAction(
  actionType: string,
  params: Record<string, unknown>
): Promise<{ result: ActionResult; externalId?: string }> {
  try {
    switch (actionType) {
      case 'create_bill': {
        const vendorName = String(params['vendorName'] ?? '');
        const amountStr = String(params['amount'] ?? '0');
        const invoiceNumber = String(params['invoiceNumber'] ?? '');
        const dueDate = String(params['dueDate'] ?? new Date().toISOString().split('T')[0]);

        // Find or create vendor
        const vendorResult = await billcomClient.findVendorByName(vendorName);
        if (!vendorResult.ok) {
          return {
            result: { success: false, error: `Failed to find vendor: ${vendorResult.error.message}` },
          };
        }

        let vendorId: string;
        if (vendorResult.value) {
          vendorId = vendorResult.value.id;
        } else {
          const createVendorResult = await billcomClient.createVendor({
            name: vendorName,
            isActive: true,
          });
          if (!createVendorResult.ok) {
            return {
              result: { success: false, error: `Failed to create vendor: ${createVendorResult.error.message}` },
            };
          }
          vendorId = createVendorResult.value.id;
        }

        // Create bill
        const amount = parseFloat(amountStr);
        const invoiceDate = new Date().toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10);
        const billResult = await billcomClient.createBill({
          vendorId,
          invoiceNumber,
          invoiceDate,
          dueDate,
          amount,
          amountDue: amount,
          lineItems: [{ amount, description: `Invoice ${invoiceNumber}` }],
        });

        if (!billResult.ok) {
          return {
            result: { success: false, error: `Failed to create bill: ${billResult.error.message}` },
          };
        }

        return {
          result: {
            success: true,
            externalId: billResult.value.id,
            data: { vendorId, billId: billResult.value.id },
          },
          externalId: billResult.value.id,
        };
      }

      case 'schedule_payment': {
        const billId = String(params['billId'] ?? '');
        const vendorId = String(params['vendorId'] ?? '');
        const amountStr = String(params['amount'] ?? '0');
        const processDate = String(params['processDate'] ?? new Date().toISOString().split('T')[0]);

        const paymentResult = await billcomClient.schedulePayment(
          billId,
          vendorId,
          parseFloat(amountStr),
          processDate,
          'ACH'
        );

        if (!paymentResult.ok) {
          return {
            result: { success: false, error: `Failed to schedule payment: ${paymentResult.error.message}` },
          };
        }

        return {
          result: {
            success: true,
            externalId: paymentResult.value.id,
            data: { paymentId: paymentResult.value.id },
          },
          externalId: paymentResult.value.id,
        };
      }

      default:
        return {
          result: { success: false, error: `Unknown Bill.com action: ${actionType}` },
        };
    }
  } catch (error) {
    return {
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
