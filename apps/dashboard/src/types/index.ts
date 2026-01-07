// Email types
export type EmailStatus =
  | 'pending'
  | 'processing'
  | 'classified'
  | 'matched'
  | 'extracted'
  | 'planned'
  | 'completed'
  | 'failed'
  | 'archived';

export type EmailType =
  | 'invoice'
  | 'receipt'
  | 'payment_notice'
  | 'bank_notice'
  | 'inquiry'
  | 'irrelevant';

export type Urgency = 'low' | 'medium' | 'high' | 'critical';

export interface EmailClassification {
  emailType: EmailType;
  intent: string;
  urgency: Urgency;
  confidence: number;
  reasoning: string;
}

export interface ExtractedField<T> {
  value: T | null;
  confidence: number;
  source: 'subject' | 'body' | 'attachment' | 'inferred';
}

export interface LineItem {
  description: string;
  amount: string;
  quantity?: number;
}

export interface ExtractedData {
  vendorName: ExtractedField<string>;
  amount: ExtractedField<string>;
  currency: ExtractedField<string>;
  dueDate: ExtractedField<string>;
  invoiceNumber: ExtractedField<string>;
  description: ExtractedField<string>;
  lineItems: LineItem[];
  overallConfidence: number;
  warnings: string[];
}

export interface Email {
  id: string;
  messageId: string;
  conversationId?: string;
  subject: string;
  senderEmail: string;
  senderName?: string;
  recipientEmail: string;
  receivedAt: string;
  bodyText?: string;
  bodyHtml?: string;
  rawHeaders: Record<string, unknown>;
  hasAttachments: boolean;
  status: EmailStatus;
  classification?: EmailClassification;
  clientId?: string;
  matchMethod?: 'explicit' | 'domain' | 'vendor' | 'content' | 'thread' | 'unmatched';
  matchConfidence?: number;
  extractedData?: ExtractedData;
  createdAt: string;
  updatedAt: string;
  processedAt?: string;
}

// Action types
export type ActionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'compensated';

export type ActionType =
  | 'create_bill'
  | 'update_bill'
  | 'delete_bill'
  | 'create_invoice'
  | 'update_invoice'
  | 'record_payment'
  | 'schedule_payment'
  | 'execute_payment'
  | 'reconcile'
  | 'send_invoice';

export type TargetSystem = 'quickbooks' | 'billcom' | 'internal';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ActionResult {
  success: boolean;
  externalId?: string;
  data?: Record<string, unknown>;
  error?: string;
}

export interface Action {
  id: string;
  emailId: string;
  sagaId?: string;
  actionType: ActionType;
  targetSystem: TargetSystem;
  parameters: Record<string, unknown>;
  riskLevel: RiskLevel;
  riskReasons: string[];
  requiresApproval: boolean;
  status: ActionStatus;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  executedAt?: string;
  result?: ActionResult;
  externalId?: string;
  error?: string;
  isCompensated: boolean;
  compensatedAt?: string;
  compensationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActionWithContext extends Action {
  email: Email;
  client: Client | null;
}

// Client types
export interface Client {
  id: string;
  name: string;
  displayName?: string;
  quickbooksId?: string;
  billcomId?: string;
  emailDomains: string[];
  knownEmails: string[];
  keywords: string[];
  defaultExpenseAccount?: string;
  approvalThreshold: number;
  autoApproveVendors: string[];
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface ClientEmailMapping {
  id: string;
  emailPattern: string;
  clientId: string;
  patternType: 'exact' | 'domain' | 'regex';
  confidence: number;
  source: 'manual' | 'learned' | 'imported';
  createdBy?: string;
  createdAt: string;
}

// Saga types
export type SagaStatus =
  | 'pending'
  | 'running'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'compensating'
  | 'compensated';

export interface SagaStep {
  id: string;
  name: string;
  actionType: string;
  targetSystem: string;
  parameters: Record<string, unknown>;
  compensation?: {
    actionType: string;
    parameters: Record<string, unknown>;
  };
  reversibility: 'full' | 'compensate' | 'soft_irreversible' | 'hard_irreversible';
  requiresApproval: boolean;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'compensated';
  result?: ActionResult;
  executedAt?: string;
  compensatedAt?: string;
}

export interface Saga {
  id: string;
  emailId: string;
  status: SagaStatus;
  currentStep: number;
  totalSteps: number;
  steps: SagaStep[];
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  compensatedAt?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

// Dashboard types
export interface DashboardSummary {
  emails: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  actions: {
    pending: number;
    pendingApproval: number;
    completed: number;
    failed: number;
  };
}

export type EventCategory =
  | 'email'
  | 'classification'
  | 'extraction'
  | 'matching'
  | 'action'
  | 'saga'
  | 'approval'
  | 'system'
  | 'auth';

export interface AuditEvent {
  id: string;
  timestamp: string;
  eventType: string;
  eventCategory: EventCategory;
  emailId?: string;
  actionId?: string;
  sagaId?: string;
  clientId?: string;
  userId?: string;
  description: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  checksum: string;
}

export interface DashboardActivity {
  events: AuditEvent[];
  counts: Record<string, number>;
}

// API response types
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface StatusCounts {
  [key: string]: number;
}
