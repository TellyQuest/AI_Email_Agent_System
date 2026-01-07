import { describe, it, expect } from 'vitest';
import {
  EmailStatus,
  EmailType,
  UrgencyLevel,
  MatchMethod,
  ExtractionSource,
  type Classification,
  type ExtractedData,
  type ConfidentValue,
  type LineItem,
  type AttachmentInfo,
  type ClientMatch,
  type EmailDomain,
} from './email.js';

describe('Email types', () => {
  describe('EmailStatus', () => {
    it('has all workflow states', () => {
      expect(EmailStatus.PENDING).toBe('pending');
      expect(EmailStatus.PROCESSING).toBe('processing');
      expect(EmailStatus.CLASSIFIED).toBe('classified');
      expect(EmailStatus.MATCHED).toBe('matched');
      expect(EmailStatus.EXTRACTED).toBe('extracted');
      expect(EmailStatus.PLANNED).toBe('planned');
      expect(EmailStatus.COMPLETED).toBe('completed');
      expect(EmailStatus.FAILED).toBe('failed');
      expect(EmailStatus.ARCHIVED).toBe('archived');
    });

    it('allows status transitions in workflow order', () => {
      const workflowOrder: EmailStatus[] = [
        EmailStatus.PENDING,
        EmailStatus.PROCESSING,
        EmailStatus.CLASSIFIED,
        EmailStatus.MATCHED,
        EmailStatus.EXTRACTED,
        EmailStatus.PLANNED,
        EmailStatus.COMPLETED,
      ];
      expect(workflowOrder).toHaveLength(7);
    });
  });

  describe('EmailType', () => {
    it('covers all bookkeeping email types', () => {
      expect(EmailType.INVOICE).toBe('invoice');
      expect(EmailType.RECEIPT).toBe('receipt');
      expect(EmailType.PAYMENT_NOTICE).toBe('payment_notice');
      expect(EmailType.BANK_NOTICE).toBe('bank_notice');
      expect(EmailType.INQUIRY).toBe('inquiry');
      expect(EmailType.IRRELEVANT).toBe('irrelevant');
    });
  });

  describe('UrgencyLevel', () => {
    it('has urgency levels in ascending order', () => {
      const levels = [UrgencyLevel.LOW, UrgencyLevel.MEDIUM, UrgencyLevel.HIGH, UrgencyLevel.CRITICAL];
      expect(levels).toEqual(['low', 'medium', 'high', 'critical']);
    });
  });

  describe('MatchMethod', () => {
    it('contains all matching methods', () => {
      expect(MatchMethod.EXPLICIT).toBe('explicit');
      expect(MatchMethod.DOMAIN).toBe('domain');
      expect(MatchMethod.VENDOR).toBe('vendor');
      expect(MatchMethod.CONTENT).toBe('content');
      expect(MatchMethod.THREAD).toBe('thread');
      expect(MatchMethod.UNMATCHED).toBe('unmatched');
    });
  });

  describe('ExtractionSource', () => {
    it('identifies where data came from', () => {
      expect(ExtractionSource.SUBJECT).toBe('subject');
      expect(ExtractionSource.BODY).toBe('body');
      expect(ExtractionSource.ATTACHMENT).toBe('attachment');
      expect(ExtractionSource.INFERRED).toBe('inferred');
    });
  });

  describe('Classification interface', () => {
    it('accepts valid classification', () => {
      const classification: Classification = {
        emailType: EmailType.INVOICE,
        intent: 'Payment request for consulting services',
        urgency: UrgencyLevel.HIGH,
        confidence: 0.95,
        reasoning: 'Contains invoice keywords, amount, and due date',
      };

      expect(classification.emailType).toBe('invoice');
      expect(classification.confidence).toBeGreaterThan(0.9);
    });
  });

  describe('ConfidentValue interface', () => {
    it('wraps value with confidence metadata', () => {
      const vendorName: ConfidentValue<string> = {
        value: 'Acme Corp',
        confidence: 0.92,
        source: ExtractionSource.BODY,
      };

      expect(vendorName.value).toBe('Acme Corp');
      expect(vendorName.confidence).toBe(0.92);
      expect(vendorName.source).toBe('body');
    });

    it('allows null values', () => {
      const dueDate: ConfidentValue<string> = {
        value: null,
        confidence: 0,
        source: ExtractionSource.INFERRED,
      };

      expect(dueDate.value).toBeNull();
      expect(dueDate.confidence).toBe(0);
    });
  });

  describe('LineItem interface', () => {
    it('captures invoice line items', () => {
      const item: LineItem = {
        description: 'Consulting services - January 2024',
        amount: '5000.00',
        quantity: 1,
        unitPrice: '5000.00',
      };

      expect(item.description).toBeDefined();
      expect(item.amount).toBe('5000.00');
    });

    it('allows minimal line item', () => {
      const item: LineItem = {
        description: 'Service fee',
        amount: '100.00',
      };

      expect(item.quantity).toBeUndefined();
      expect(item.unitPrice).toBeUndefined();
    });
  });

  describe('AttachmentInfo interface', () => {
    it('tracks attachment metadata', () => {
      const attachment: AttachmentInfo = {
        id: 'att-123',
        filename: 'invoice-001.pdf',
        contentType: 'application/pdf',
        size: 102400,
        storagePath: 's3://bucket/attachments/att-123.pdf',
      };

      expect(attachment.filename).toContain('.pdf');
      expect(attachment.contentType).toBe('application/pdf');
      expect(attachment.size).toBeGreaterThan(0);
    });
  });

  describe('ClientMatch interface', () => {
    it('represents successful match', () => {
      const match: ClientMatch = {
        clientId: 'client-456',
        matchMethod: MatchMethod.EXPLICIT,
        confidence: 1.0,
        candidates: [
          {
            clientId: 'client-456',
            clientName: 'ABC Company',
            confidence: 1.0,
            matchMethod: MatchMethod.EXPLICIT,
          },
        ],
      };

      expect(match.clientId).toBe('client-456');
      expect(match.candidates).toHaveLength(1);
    });

    it('represents unmatched email', () => {
      const match: ClientMatch = {
        clientId: null,
        matchMethod: MatchMethod.UNMATCHED,
        confidence: 0,
        candidates: [],
      };

      expect(match.clientId).toBeNull();
      expect(match.matchMethod).toBe('unmatched');
    });

    it('includes multiple candidates for ambiguous matches', () => {
      const match: ClientMatch = {
        clientId: 'client-1',
        matchMethod: MatchMethod.DOMAIN,
        confidence: 0.8,
        candidates: [
          { clientId: 'client-1', clientName: 'ABC Corp', confidence: 0.8, matchMethod: MatchMethod.DOMAIN },
          { clientId: 'client-2', clientName: 'ABC Inc', confidence: 0.6, matchMethod: MatchMethod.CONTENT },
        ],
      };

      expect(match.candidates).toHaveLength(2);
      expect(match.candidates[0]?.confidence).toBeGreaterThan(match.candidates[1]?.confidence ?? 0);
    });
  });

  describe('EmailDomain interface', () => {
    it('represents complete email domain object', () => {
      const email: EmailDomain = {
        id: 'email-789',
        messageId: '<msg-123@example.com>',
        conversationId: 'conv-456',
        subject: 'Invoice #001 - Payment Due',
        senderEmail: 'billing@vendor.com',
        senderName: 'Vendor Billing',
        recipientEmail: 'ap@company.com',
        receivedAt: new Date('2024-01-15T10:00:00Z'),
        bodyText: 'Please find attached invoice...',
        bodyHtml: '<p>Please find attached invoice...</p>',
        hasAttachments: true,
        attachments: [
          {
            id: 'att-1',
            filename: 'invoice.pdf',
            contentType: 'application/pdf',
            size: 50000,
            storagePath: 's3://bucket/att-1.pdf',
          },
        ],
        status: EmailStatus.PENDING,
        classification: null,
        clientId: null,
        matchMethod: null,
        matchConfidence: null,
        extractedData: null,
      };

      expect(email.status).toBe('pending');
      expect(email.hasAttachments).toBe(true);
      expect(email.attachments).toHaveLength(1);
    });

    it('tracks processing state progression', () => {
      const email: EmailDomain = {
        id: 'email-processed',
        messageId: '<msg-456@example.com>',
        conversationId: null,
        subject: 'Invoice for Services',
        senderEmail: 'vendor@acme.com',
        senderName: null,
        recipientEmail: 'ap@client.com',
        receivedAt: new Date(),
        bodyText: 'Invoice attached',
        bodyHtml: null,
        hasAttachments: false,
        attachments: [],
        status: EmailStatus.EXTRACTED,
        classification: {
          emailType: EmailType.INVOICE,
          intent: 'Payment request',
          urgency: UrgencyLevel.MEDIUM,
          confidence: 0.9,
          reasoning: 'Contains invoice keywords',
        },
        clientId: 'client-123',
        matchMethod: MatchMethod.DOMAIN,
        matchConfidence: 0.85,
        extractedData: {
          vendorName: { value: 'Acme Corp', confidence: 0.9, source: ExtractionSource.BODY },
          amount: { value: '1500.00', confidence: 0.95, source: ExtractionSource.BODY },
          currency: { value: 'USD', confidence: 0.99, source: ExtractionSource.INFERRED },
          dueDate: { value: '2024-02-01', confidence: 0.8, source: ExtractionSource.BODY },
          invoiceNumber: { value: 'INV-001', confidence: 0.9, source: ExtractionSource.SUBJECT },
          description: { value: 'Consulting services', confidence: 0.7, source: ExtractionSource.BODY },
          lineItems: [],
          attachments: [],
          overallConfidence: 0.87,
          warnings: [],
        },
      };

      expect(email.status).toBe('extracted');
      expect(email.classification).not.toBeNull();
      expect(email.extractedData?.overallConfidence).toBeGreaterThan(0.8);
    });
  });
});
