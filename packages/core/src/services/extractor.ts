import { Result } from '@ai-email-agent/utils';
import { EmailDomain, Classification, ExtractedData } from '../types/email.js';

// Extraction errors
export const ExtractionErrorCode = {
  LLM_ERROR: 'LLM_ERROR',
  PARSE_ERROR: 'PARSE_ERROR',
  TIMEOUT: 'TIMEOUT',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_INPUT: 'INVALID_INPUT',
  ATTACHMENT_ERROR: 'ATTACHMENT_ERROR',
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
} as const;
export type ExtractionErrorCode = (typeof ExtractionErrorCode)[keyof typeof ExtractionErrorCode];

export interface ExtractionError {
  code: ExtractionErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

// Extractor service interface
export interface IExtractorService {
  /**
   * Extract structured financial data from an email
   */
  extract(
    email: EmailDomain,
    classification: Classification
  ): Promise<Result<ExtractedData, ExtractionError>>;

  /**
   * Extract data from an attachment (PDF, image, etc.)
   */
  extractFromAttachment?(
    attachmentPath: string,
    contentType: string
  ): Promise<Result<Partial<ExtractedData>, ExtractionError>>;
}

// Extraction options
export interface ExtractionOptions {
  // Override default model
  model?: string;
  // Include attachment processing
  processAttachments?: boolean;
  // Minimum confidence threshold
  minConfidence?: number;
  // Temperature for LLM
  temperature?: number;
}
