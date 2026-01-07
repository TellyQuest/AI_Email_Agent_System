import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from '@ai-email-agent/utils';
import { ClassifierService } from './classifier-service.js';
import { EmailDomain, Classification } from '../../types/email.js';

// Mock GroqClient
const mockGroqClient = {
  classify: vi.fn(),
};

// Sample email for testing
const sampleEmail: EmailDomain = {
  id: 'email-123',
  messageId: 'msg-123',
  conversationId: 'conv-123',
  subject: 'Invoice #12345 from Acme Corp',
  senderEmail: 'billing@acme.com',
  senderName: 'Acme Billing',
  recipientEmail: 'ap@mycompany.com',
  receivedAt: new Date('2024-01-15'),
  bodyText: 'Please find attached invoice #12345 for $1,500.00 due by January 30, 2024.',
  bodyHtml: null,
  hasAttachments: true,
  attachments: [],
  status: 'pending',
  classification: null,
  clientId: null,
  matchMethod: null,
  matchConfidence: null,
  extractedData: null,
};

const sampleClassification: Classification = {
  emailType: 'invoice',
  intent: 'Request for payment',
  urgency: 'medium',
  confidence: 0.95,
  reasoning: 'Email contains invoice number and payment terms',
};

describe('ClassifierService', () => {
  let service: ClassifierService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ClassifierService(mockGroqClient as any);
  });

  describe('classify', () => {
    it('should classify an email successfully', async () => {
      mockGroqClient.classify.mockResolvedValue(ok(sampleClassification));

      const result = await service.classify(sampleEmail);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.emailType).toBe('invoice');
        expect(result.value.confidence).toBe(0.95);
      }
      expect(mockGroqClient.classify).toHaveBeenCalledWith(sampleEmail);
    });

    it('should return error for email without body', async () => {
      const emailWithoutBody = { ...sampleEmail, bodyText: null, bodyHtml: null };

      const result = await service.classify(emailWithoutBody);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_INPUT');
        expect(result.error.message).toContain('body content');
      }
    });

    it('should handle LLM errors', async () => {
      mockGroqClient.classify.mockResolvedValue(
        err({ code: 'API_ERROR', message: 'Rate limited' })
      );

      const result = await service.classify(sampleEmail);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('LLM_ERROR');
      }
    });

    it('should use HTML body if text body is not available', async () => {
      const emailWithHtml = {
        ...sampleEmail,
        bodyText: null,
        bodyHtml: '<p>Invoice content</p>',
      };
      mockGroqClient.classify.mockResolvedValue(ok(sampleClassification));

      const result = await service.classify(emailWithHtml);

      expect(result.ok).toBe(true);
      expect(mockGroqClient.classify).toHaveBeenCalled();
    });

    it('should apply temperature from options', async () => {
      const lowConfidenceClassification = { ...sampleClassification, confidence: 0.5 };
      mockGroqClient.classify.mockResolvedValue(ok(lowConfidenceClassification));

      const serviceWithOptions = new ClassifierService(mockGroqClient as any, {
        temperature: 0.1,
      });

      const result = await serviceWithOptions.classify(sampleEmail);

      expect(result.ok).toBe(true);
      // Service should still return result
    });
  });

  describe('classifyBatch', () => {
    it('should classify multiple emails', async () => {
      mockGroqClient.classify.mockResolvedValue(ok(sampleClassification));

      const emails = [sampleEmail, { ...sampleEmail, id: 'email-456' }];
      const result = await service.classifyBatch(emails);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
      }
    });

    it('should handle partial failures in batch', async () => {
      mockGroqClient.classify
        .mockResolvedValueOnce(ok(sampleClassification))
        .mockResolvedValueOnce(err({ code: 'API_ERROR', message: 'Failed' }));

      const emails = [sampleEmail, { ...sampleEmail, id: 'email-456' }];
      const result = await service.classifyBatch(emails);

      // Batch should fail if any classification fails
      expect(result.ok).toBe(false);
    });

    it('should return empty array for empty input', async () => {
      const result = await service.classifyBatch([]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });
  });
});
