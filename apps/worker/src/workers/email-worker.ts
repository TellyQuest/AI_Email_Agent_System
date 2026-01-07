import { PgBoss, Job } from 'pg-boss';
import { createLogger } from '@ai-email-agent/utils';
import {
  emailRepository,
  actionRepository,
  auditRepository,
  clientRepository,
} from '@ai-email-agent/database';
import {
  outlookClient,
  groqClient,
  minioClient,
} from '@ai-email-agent/integrations';
import { loadRiskPolicy } from '@ai-email-agent/config';

const logger = createLogger({ service: 'email-worker' });

interface EmailJob {
  messageId: string;
  resource: string;
  notificationTime: string;
}

export const EMAIL_QUEUE = 'email-processing';
export const ACTION_QUEUE = 'action-execution';

export async function registerEmailWorker(boss: PgBoss): Promise<void> {
  await boss.work<EmailJob>(
    EMAIL_QUEUE,
    { batchSize: 10, pollingIntervalSeconds: 2 },
    async (jobs: Job<EmailJob>[]) => {
      for (const job of jobs) {
        const { messageId } = job.data;
        logger.info({ jobId: job.id, messageId }, 'Processing email');

        try {
          await processEmail(boss, job);
        } catch (error) {
          logger.error({ error, messageId }, 'Failed to process email');
          throw error;
        }
      }
    }
  );

  logger.info('Email worker registered');
}

async function processEmail(boss: PgBoss, job: Job<EmailJob>) {
  const { messageId } = job.data;

  // 1. Fetch email from Outlook
  const fetchResult = await outlookClient.getMessage(messageId);
  if (!fetchResult.ok) {
    throw new Error(`Failed to fetch email: ${fetchResult.error.message}`);
  }

  const email = fetchResult.value;

  // 2. Check for duplicates
  const existsResult = await emailRepository.exists(email.messageId);
  if (existsResult.ok && existsResult.value) {
    logger.info({ messageId }, 'Email already processed, skipping');
    return { status: 'skipped', reason: 'duplicate' };
  }

  // 3. Store email in database
  const createResult = await emailRepository.create({
    messageId: email.messageId,
    conversationId: email.conversationId,
    subject: email.subject,
    senderEmail: email.senderEmail,
    senderName: email.senderName,
    recipientEmail: email.recipientEmail,
    receivedAt: email.receivedAt,
    bodyText: email.bodyText,
    bodyHtml: email.bodyHtml,
    hasAttachments: email.hasAttachments,
    status: 'processing',
  });

  if (!createResult.ok) {
    throw new Error(`Failed to store email: ${createResult.error.message}`);
  }

  const storedEmail = createResult.value;

  // Log audit
  await auditRepository.logEmailEvent(
    'email.received',
    storedEmail.id,
    `Email received from ${email.senderEmail}`,
    { subject: email.subject }
  );

  // 4. Fetch and store attachments
  if (email.hasAttachments) {
    const attachmentsResult = await outlookClient.getAttachments(messageId);
    if (attachmentsResult.ok) {
      for (const attachment of attachmentsResult.value) {
        const contentResult = await outlookClient.getAttachmentContent(
          messageId,
          attachment.id
        );
        if (contentResult.ok) {
          await minioClient.uploadAttachment(
            storedEmail.id,
            attachment.id,
            attachment.filename,
            contentResult.value,
            attachment.contentType
          );
        }
      }
    }
  }

  // 5. Classify email
  const classifyResult = await groqClient.classify({
    ...email,
    id: storedEmail.id,
    status: 'processing',
    classification: null,
    clientId: null,
    matchMethod: null,
    matchConfidence: null,
    extractedData: null,
  });

  if (!classifyResult.ok) {
    await emailRepository.updateStatus(storedEmail.id, 'failed');
    throw new Error(`Classification failed: ${classifyResult.error.message}`);
  }

  const classification = classifyResult.value;
  await emailRepository.updateClassification(storedEmail.id, classification);

  await auditRepository.logEmailEvent(
    'email.classified',
    storedEmail.id,
    `Email classified as ${classification.emailType} (confidence: ${classification.confidence})`,
    { classification }
  );

  // 6. Skip irrelevant emails
  if (classification.emailType === 'irrelevant') {
    await emailRepository.updateStatus(storedEmail.id, 'archived');
    logger.info({ emailId: storedEmail.id }, 'Email classified as irrelevant, archived');
    return { status: 'archived', reason: 'irrelevant' };
  }

  // 7. Match to client
  const matchResult = await clientRepository.findByEmail(email.senderEmail);
  let clientId: string | null = null;
  let matchMethod: 'explicit' | 'domain' | 'vendor' | 'content' | 'thread' | 'unmatched' = 'unmatched';
  let matchConfidence = 0;

  if (matchResult.ok && matchResult.value.length > 0) {
    const bestMatch = matchResult.value[0];
    if (bestMatch) {
      clientId = bestMatch.client.id;
      matchMethod = bestMatch.matchMethod as 'explicit' | 'domain' | 'vendor' | 'content' | 'thread' | 'unmatched';
      matchConfidence = bestMatch.confidence;
    }
  }

  await emailRepository.updateClientMatch(
    storedEmail.id,
    clientId,
    matchMethod as 'explicit' | 'domain' | 'vendor' | 'content' | 'thread' | 'unmatched',
    matchConfidence
  );

  await auditRepository.logEmailEvent(
    'email.matched',
    storedEmail.id,
    clientId
      ? `Email matched to client ${clientId} via ${matchMethod} (confidence: ${matchConfidence})`
      : 'Email could not be matched to a client',
    { clientId, matchMethod, matchConfidence }
  );

  // 8. Extract data
  const extractResult = await groqClient.extract(
    {
      ...email,
      id: storedEmail.id,
      status: 'matched',
      classification,
      clientId,
      matchMethod: matchMethod as 'explicit' | 'domain' | 'vendor' | 'content' | 'thread' | 'unmatched',
      matchConfidence,
      extractedData: null,
    },
    classification
  );

  if (!extractResult.ok) {
    await emailRepository.updateStatus(storedEmail.id, 'failed');
    throw new Error(`Extraction failed: ${extractResult.error.message}`);
  }

  const extractedData = extractResult.value;
  await emailRepository.updateExtractedData(storedEmail.id, extractedData);

  await auditRepository.logEmailEvent(
    'email.extracted',
    storedEmail.id,
    `Data extracted with confidence ${extractedData.overallConfidence}`,
    {
      vendor: extractedData.vendorName.value,
      amount: extractedData.amount.value,
      confidence: extractedData.overallConfidence,
    }
  );

  // 9. Plan actions based on email type
  const policy = loadRiskPolicy();
  const actions = planActions(classification.emailType, extractedData, clientId, policy);

  // 10. Create actions in database
  for (const action of actions) {
    const actionResult = await actionRepository.create({
      emailId: storedEmail.id,
      actionType: action.actionType,
      targetSystem: action.targetSystem,
      parameters: action.parameters,
      riskLevel: action.riskLevel,
      riskReasons: action.riskReasons,
      requiresApproval: action.requiresApproval,
      status: 'pending',
    });

    if (actionResult.ok) {
      await auditRepository.logActionEvent(
        'action.created',
        actionResult.value.id,
        storedEmail.id,
        `Action ${action.actionType} created (risk: ${action.riskLevel})`,
        { metadata: { action } }
      );

      // Auto-execute low-risk actions that don't require approval
      if (!action.requiresApproval) {
        await boss.send(ACTION_QUEUE, { actionId: actionResult.value.id });
      }
    }
  }

  await emailRepository.updateStatus(storedEmail.id, 'planned');

  logger.info(
    { emailId: storedEmail.id, actionsCreated: actions.length },
    'Email processing complete'
  );

  return {
    status: 'processed',
    emailId: storedEmail.id,
    classification: classification.emailType,
    actionsCreated: actions.length,
  };
}

type ActionType = 'create_bill' | 'record_payment' | 'update_bill' | 'delete_bill' | 'create_invoice' | 'update_invoice' | 'schedule_payment' | 'execute_payment' | 'reconcile' | 'send_invoice';
type TargetSystem = 'quickbooks' | 'billcom' | 'internal';
type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

interface PlannedAction {
  actionType: ActionType;
  targetSystem: TargetSystem;
  parameters: Record<string, unknown>;
  riskLevel: RiskLevel;
  riskReasons: string[];
  requiresApproval: boolean;
}

function planActions(
  emailType: string,
  extractedData: {
    vendorName: { value: string | null; confidence: number };
    amount: { value: string | null; confidence: number };
    dueDate: { value: string | null };
    invoiceNumber: { value: string | null };
    overallConfidence: number;
  },
  clientId: string | null,
  policy: { settings: { defaultRiskLevel: string } }
): PlannedAction[] {
  const actions: PlannedAction[] = [];

  if (emailType === 'invoice' && extractedData.amount.value) {
    const amount = parseFloat(extractedData.amount.value);
    const riskReasons: string[] = [];
    let riskLevel: RiskLevel = (policy.settings.defaultRiskLevel as RiskLevel) || 'medium';
    let requiresApproval = false;

    // Determine risk level
    if (amount > 25000) {
      riskLevel = 'critical';
      riskReasons.push('Amount exceeds $25,000');
      requiresApproval = true;
    } else if (amount > 5000) {
      riskLevel = 'high';
      riskReasons.push('Amount exceeds $5,000');
      requiresApproval = true;
    } else if (amount > 1000) {
      riskLevel = 'medium';
      riskReasons.push('Amount exceeds $1,000');
    }

    if (extractedData.overallConfidence < 0.8) {
      riskLevel = 'high';
      riskReasons.push('Low extraction confidence');
      requiresApproval = true;
    }

    if (!clientId) {
      riskLevel = 'high';
      riskReasons.push('Could not match to client');
      requiresApproval = true;
    }

    // Create bill action
    actions.push({
      actionType: 'create_bill',
      targetSystem: 'quickbooks',
      parameters: {
        vendorName: extractedData.vendorName.value,
        amount: extractedData.amount.value,
        dueDate: extractedData.dueDate.value,
        invoiceNumber: extractedData.invoiceNumber.value,
        clientId,
      },
      riskLevel,
      riskReasons,
      requiresApproval,
    });
  }

  if (emailType === 'receipt' && extractedData.amount.value) {
    actions.push({
      actionType: 'record_payment',
      targetSystem: 'quickbooks',
      parameters: {
        vendorName: extractedData.vendorName.value,
        amount: extractedData.amount.value,
        paymentDate: new Date().toISOString().split('T')[0],
        clientId,
      },
      riskLevel: 'low',
      riskReasons: [],
      requiresApproval: false,
    });
  }

  return actions;
}
