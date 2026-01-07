import { describe, it, expect } from 'vitest';
import {
  ClassificationErrorCode,
  type ClassificationError,
  type ClassificationOptions,
} from './classifier.js';

describe('Classifier service', () => {
  describe('ClassificationErrorCode', () => {
    it('defines all error codes', () => {
      expect(ClassificationErrorCode.LLM_ERROR).toBe('LLM_ERROR');
      expect(ClassificationErrorCode.PARSE_ERROR).toBe('PARSE_ERROR');
      expect(ClassificationErrorCode.TIMEOUT).toBe('TIMEOUT');
      expect(ClassificationErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
      expect(ClassificationErrorCode.INVALID_INPUT).toBe('INVALID_INPUT');
    });

    it('has 5 distinct error codes', () => {
      const codes = Object.values(ClassificationErrorCode);
      expect(codes).toHaveLength(5);
    });
  });

  describe('ClassificationError interface', () => {
    it('captures LLM API errors', () => {
      const error: ClassificationError = {
        code: ClassificationErrorCode.LLM_ERROR,
        message: 'Anthropic API returned 500 Internal Server Error',
        details: {
          statusCode: 500,
          requestId: 'req-123',
        },
      };

      expect(error.code).toBe('LLM_ERROR');
      expect(error.details?.['statusCode']).toBe(500);
    });

    it('captures parsing errors', () => {
      const error: ClassificationError = {
        code: ClassificationErrorCode.PARSE_ERROR,
        message: 'Failed to parse LLM response as JSON',
        details: {
          rawResponse: 'Invalid JSON here...',
        },
      };

      expect(error.code).toBe('PARSE_ERROR');
    });

    it('captures timeout errors', () => {
      const error: ClassificationError = {
        code: ClassificationErrorCode.TIMEOUT,
        message: 'Classification request timed out after 30000ms',
      };

      expect(error.code).toBe('TIMEOUT');
      expect(error.details).toBeUndefined();
    });

    it('captures rate limit errors', () => {
      const error: ClassificationError = {
        code: ClassificationErrorCode.RATE_LIMITED,
        message: 'Rate limit exceeded, retry after 60 seconds',
        details: {
          retryAfter: 60,
          limit: 100,
          remaining: 0,
        },
      };

      expect(error.code).toBe('RATE_LIMITED');
      expect(error.details?.['retryAfter']).toBe(60);
    });
  });

  describe('ClassificationOptions interface', () => {
    it('allows configuring classification behavior', () => {
      const options: ClassificationOptions = {
        model: 'claude-3-5-sonnet-latest',
        maxTokens: 1024,
        temperature: 0.3,
        includeReasoning: true,
      };

      expect(options.model).toBeDefined();
      expect(options.temperature).toBeLessThan(1);
    });

    it('allows minimal options', () => {
      const options: ClassificationOptions = {};

      expect(options.model).toBeUndefined();
      expect(options.includeReasoning).toBeUndefined();
    });
  });
});
