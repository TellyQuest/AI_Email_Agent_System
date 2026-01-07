import { Result } from '@ai-email-agent/utils';
import { EmailDomain, Classification } from '../types/email.js';

// Classification errors
export const ClassificationErrorCode = {
  LLM_ERROR: 'LLM_ERROR',
  PARSE_ERROR: 'PARSE_ERROR',
  TIMEOUT: 'TIMEOUT',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_INPUT: 'INVALID_INPUT',
} as const;
export type ClassificationErrorCode = (typeof ClassificationErrorCode)[keyof typeof ClassificationErrorCode];

export interface ClassificationError {
  code: ClassificationErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

// Classifier service interface
export interface IClassifierService {
  /**
   * Classify an email to determine its type and intent
   */
  classify(email: EmailDomain): Promise<Result<Classification, ClassificationError>>;

  /**
   * Classify multiple emails in batch (for efficiency)
   */
  classifyBatch?(emails: EmailDomain[]): Promise<Result<Classification[], ClassificationError>>;
}

// Classification options
export interface ClassificationOptions {
  // Override default model
  model?: string;
  // Maximum tokens for response
  maxTokens?: number;
  // Temperature for LLM
  temperature?: number;
  // Include chain-of-thought reasoning
  includeReasoning?: boolean;
}
