// Email processing domain types

export const EmailStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  CLASSIFIED: 'classified',
  MATCHED: 'matched',
  EXTRACTED: 'extracted',
  PLANNED: 'planned',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ARCHIVED: 'archived',
} as const;
export type EmailStatus = (typeof EmailStatus)[keyof typeof EmailStatus];

export const EmailType = {
  INVOICE: 'invoice',
  RECEIPT: 'receipt',
  PAYMENT_NOTICE: 'payment_notice',
  BANK_NOTICE: 'bank_notice',
  INQUIRY: 'inquiry',
  IRRELEVANT: 'irrelevant',
} as const;
export type EmailType = (typeof EmailType)[keyof typeof EmailType];

export const UrgencyLevel = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;
export type UrgencyLevel = (typeof UrgencyLevel)[keyof typeof UrgencyLevel];

export const MatchMethod = {
  EXPLICIT: 'explicit',
  DOMAIN: 'domain',
  VENDOR: 'vendor',
  CONTENT: 'content',
  THREAD: 'thread',
  UNMATCHED: 'unmatched',
} as const;
export type MatchMethod = (typeof MatchMethod)[keyof typeof MatchMethod];

// Classification result from LLM
export interface Classification {
  emailType: EmailType;
  intent: string;
  urgency: UrgencyLevel;
  confidence: number;
  reasoning: string;
}

// Extraction source - where in the email data was found
export const ExtractionSource = {
  SUBJECT: 'subject',
  BODY: 'body',
  ATTACHMENT: 'attachment',
  INFERRED: 'inferred',
} as const;
export type ExtractionSource = (typeof ExtractionSource)[keyof typeof ExtractionSource];

// Generic confident value (value + confidence score + source)
export interface ConfidentValue<T> {
  value: T | null;
  confidence: number;
  source: ExtractionSource;
}

// Line item from invoice
export interface LineItem {
  description: string;
  amount: string;
  quantity?: number;
  unitPrice?: string;
}

// Attachment info for processing
export interface AttachmentInfo {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  storagePath: string;
}

// Extracted data from email content
export interface ExtractedData {
  vendorName: ConfidentValue<string>;
  amount: ConfidentValue<string>;
  currency: ConfidentValue<string>;
  dueDate: ConfidentValue<string>;
  invoiceNumber: ConfidentValue<string>;
  description: ConfidentValue<string>;
  lineItems: LineItem[];
  attachments: AttachmentInfo[];
  overallConfidence: number;
  warnings: string[];
}

// Client match result
export interface ClientMatch {
  clientId: string | null;
  matchMethod: MatchMethod;
  confidence: number;
  candidates: Array<{
    clientId: string;
    clientName: string;
    confidence: number;
    matchMethod: MatchMethod;
  }>;
}

// Email domain object
export interface EmailDomain {
  id: string;
  messageId: string;
  conversationId: string | null;
  subject: string;
  senderEmail: string;
  senderName: string | null;
  recipientEmail: string;
  receivedAt: Date;
  bodyText: string | null;
  bodyHtml: string | null;
  hasAttachments: boolean;
  attachments: AttachmentInfo[];
  status: EmailStatus;
  classification: Classification | null;
  clientId: string | null;
  matchMethod: MatchMethod | null;
  matchConfidence: number | null;
  extractedData: ExtractedData | null;
}
