import type { NewClient, NewEmail, NewAction, NewSaga, SagaStepDefinition } from '../schema/index.js';

/**
 * Create a test client with default values
 */
export function createTestClient(overrides: Partial<NewClient> = {}): NewClient {
  return {
    name: 'Test Client',
    displayName: 'Test Client Display',
    quickbooksId: null,
    billcomId: null,
    emailDomains: ['test.com'],
    knownEmails: ['billing@test.com'],
    keywords: ['test', 'invoice'],
    defaultExpenseAccount: '5000',
    approvalThreshold: '5000.00',
    autoApproveVendors: [],
    isActive: true,
    ...overrides,
  };
}

/**
 * Create a test email with default values
 */
export function createTestEmail(overrides: Partial<NewEmail> = {}): NewEmail {
  const timestamp = Date.now();
  return {
    messageId: `test-${timestamp}@example.com`,
    conversationId: null,
    subject: 'Test Invoice #001',
    senderEmail: 'vendor@example.com',
    senderName: 'Test Vendor',
    recipientEmail: 'ap@company.com',
    receivedAt: new Date(),
    bodyText: 'Please find attached invoice for services rendered.',
    bodyHtml: '<p>Please find attached invoice for services rendered.</p>',
    rawHeaders: { 'Content-Type': 'text/html' },
    hasAttachments: false,
    status: 'pending',
    classification: null,
    clientId: null,
    matchMethod: null,
    matchConfidence: null,
    extractedData: null,
    ...overrides,
  };
}

/**
 * Create a classified test email
 */
export function createClassifiedEmail(
  clientId: string | null = null,
  overrides: Partial<NewEmail> = {}
): NewEmail {
  return createTestEmail({
    status: 'classified',
    classification: {
      emailType: 'invoice',
      intent: 'Payment request',
      urgency: 'medium',
      confidence: 0.95,
      reasoning: 'Contains invoice keywords',
    },
    clientId,
    matchMethod: clientId ? 'domain' : null,
    matchConfidence: clientId ? '0.90' : null,
    ...overrides,
  });
}

/**
 * Create an extracted test email
 */
export function createExtractedEmail(
  clientId: string | null = null,
  overrides: Partial<NewEmail> = {}
): NewEmail {
  return createClassifiedEmail(clientId, {
    status: 'extracted',
    extractedData: {
      vendorName: { value: 'Test Vendor Inc', confidence: 0.95, source: 'body' },
      amount: { value: '1500.00', confidence: 0.98, source: 'body' },
      currency: { value: 'USD', confidence: 0.99, source: 'inferred' },
      dueDate: { value: '2024-02-15', confidence: 0.85, source: 'body' },
      invoiceNumber: { value: 'INV-001', confidence: 0.92, source: 'subject' },
      description: { value: 'Consulting services', confidence: 0.80, source: 'body' },
      lineItems: [
        { description: 'Consulting - January', amount: '1500.00', quantity: 1 },
      ],
      overallConfidence: 0.90,
      warnings: [],
    },
    ...overrides,
  });
}

/**
 * Create a test action with default values
 */
export function createTestAction(
  emailId: string,
  overrides: Partial<NewAction> = {}
): NewAction {
  return {
    emailId,
    sagaId: null,
    actionType: 'create_bill',
    targetSystem: 'quickbooks',
    parameters: {
      vendorName: 'Test Vendor',
      amount: 1500.0,
      dueDate: '2024-02-15',
    },
    riskLevel: 'medium',
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
  };
}

/**
 * Create a default saga step definition
 */
export function createTestSagaStep(overrides: Partial<SagaStepDefinition> = {}): SagaStepDefinition {
  return {
    id: `step-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    name: 'Create Bill',
    actionType: 'create_bill',
    targetSystem: 'quickbooks',
    parameters: { vendorName: 'Test Vendor', amount: 1000 },
    reversibility: 'compensate',
    requiresApproval: false,
    status: 'pending',
    ...overrides,
  };
}

/**
 * Create a test saga with default values
 */
export function createTestSaga(
  emailId: string,
  overrides: Partial<NewSaga> = {}
): NewSaga {
  const defaultSteps: SagaStepDefinition[] = [
    createTestSagaStep({ id: 'step-1', name: 'Create Bill', actionType: 'create_bill' }),
    createTestSagaStep({ id: 'step-2', name: 'Schedule Payment', actionType: 'schedule_payment' }),
  ];

  return {
    emailId,
    status: 'pending',
    currentStep: 0,
    totalSteps: defaultSteps.length,
    steps: defaultSteps,
    error: null,
    startedAt: new Date(),
    completedAt: null,
    failedAt: null,
    compensatedAt: null,
    ...overrides,
  };
}

/**
 * Generate unique message ID
 */
export function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(7)}@test.example.com`;
}

/**
 * Generate unique test email
 */
let emailCounter = 0;
export function generateUniqueEmail(overrides: Partial<NewEmail> = {}): NewEmail {
  emailCounter++;
  return createTestEmail({
    messageId: `test-email-${emailCounter}-${Date.now()}@example.com`,
    subject: `Test Email #${emailCounter}`,
    ...overrides,
  });
}
