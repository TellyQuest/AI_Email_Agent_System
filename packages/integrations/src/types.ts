// Types used by integrations - local copies to avoid cyclic dependency with @ai-email-agent/core

export type EmailType = 'invoice' | 'receipt' | 'payment_notice' | 'bank_notice' | 'inquiry' | 'irrelevant';

export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';

export type EmailStatus = 'pending' | 'processing' | 'classified' | 'matched' | 'extracted' | 'planned' | 'completed' | 'failed' | 'archived';

export type MatchMethod = 'explicit' | 'domain' | 'vendor' | 'content' | 'thread' | 'unmatched';

export interface Classification {
  emailType: EmailType;
  intent: string;
  urgency: UrgencyLevel;
  confidence: number;
  reasoning: string;
}

export interface ConfidentField<T> {
  value: T | null;
  confidence: number;
  source: 'subject' | 'body' | 'attachment' | 'inferred';
}

export interface LineItem {
  description: string;
  amount: string;
  quantity?: number;
}

export interface AttachmentInfo {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  storagePath: string;
}

export interface ExtractedData {
  vendorName: ConfidentField<string>;
  amount: ConfidentField<string>;
  currency: ConfidentField<string>;
  dueDate: ConfidentField<string>;
  invoiceNumber: ConfidentField<string>;
  description: ConfidentField<string>;
  lineItems: LineItem[];
  attachments: AttachmentInfo[];
  overallConfidence: number;
  warnings: string[];
}

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
