import { describe, it, expect } from 'vitest';
import {
  emailStatusValues,
  emailTypeValues,
  urgencyLevelValues,
  matchMethodValues,
  type EmailStatus,
  type EmailType,
  type UrgencyLevel,
  type MatchMethod,
  type ClassificationData,
  type ExtractedData,
  type ExtractedDataField,
} from './emails.js';

describe('Email schema types', () => {
  describe('emailStatusValues', () => {
    it('contains all expected status values', () => {
      expect(emailStatusValues).toContain('pending');
      expect(emailStatusValues).toContain('processing');
      expect(emailStatusValues).toContain('classified');
      expect(emailStatusValues).toContain('matched');
      expect(emailStatusValues).toContain('extracted');
      expect(emailStatusValues).toContain('planned');
      expect(emailStatusValues).toContain('completed');
      expect(emailStatusValues).toContain('failed');
      expect(emailStatusValues).toContain('archived');
    });

    it('has exactly 9 status values', () => {
      expect(emailStatusValues).toHaveLength(9);
    });
  });

  describe('emailTypeValues', () => {
    it('contains all expected email types', () => {
      expect(emailTypeValues).toContain('invoice');
      expect(emailTypeValues).toContain('receipt');
      expect(emailTypeValues).toContain('payment_notice');
      expect(emailTypeValues).toContain('bank_notice');
      expect(emailTypeValues).toContain('inquiry');
      expect(emailTypeValues).toContain('irrelevant');
    });

    it('has exactly 6 email types', () => {
      expect(emailTypeValues).toHaveLength(6);
    });
  });

  describe('urgencyLevelValues', () => {
    it('contains urgency levels in order', () => {
      expect(urgencyLevelValues).toEqual(['low', 'medium', 'high', 'critical']);
    });
  });

  describe('matchMethodValues', () => {
    it('contains all match methods', () => {
      expect(matchMethodValues).toContain('explicit');
      expect(matchMethodValues).toContain('domain');
      expect(matchMethodValues).toContain('vendor');
      expect(matchMethodValues).toContain('content');
      expect(matchMethodValues).toContain('thread');
      expect(matchMethodValues).toContain('unmatched');
    });
  });

  describe('ClassificationData type', () => {
    it('accepts valid classification data', () => {
      const classification: ClassificationData = {
        emailType: 'invoice',
        intent: 'Request payment for services',
        urgency: 'high',
        confidence: 0.95,
        reasoning: 'Contains invoice keywords and payment details',
      };

      expect(classification.emailType).toBe('invoice');
      expect(classification.confidence).toBeGreaterThan(0);
      expect(classification.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('ExtractedData type', () => {
    it('accepts valid extracted data structure', () => {
      const field: ExtractedDataField<string> = {
        value: 'Acme Corp',
        confidence: 0.9,
        source: 'body',
      };

      const extracted: ExtractedData = {
        vendorName: field,
        amount: { value: '1500.00', confidence: 0.95, source: 'body' },
        currency: { value: 'USD', confidence: 0.99, source: 'inferred' },
        dueDate: { value: '2024-01-15', confidence: 0.8, source: 'body' },
        invoiceNumber: { value: 'INV-001', confidence: 0.85, source: 'subject' },
        description: { value: 'Consulting services', confidence: 0.7, source: 'body' },
        lineItems: [
          { description: 'Consulting - January', amount: '1500.00', quantity: 1 },
        ],
        overallConfidence: 0.87,
        warnings: [],
      };

      expect(extracted.vendorName.value).toBe('Acme Corp');
      expect(extracted.lineItems).toHaveLength(1);
      expect(extracted.overallConfidence).toBeCloseTo(0.87);
    });

    it('allows null values in extracted fields', () => {
      const field: ExtractedDataField<string> = {
        value: null,
        confidence: 0,
        source: 'body',
      };

      expect(field.value).toBeNull();
    });
  });
});
