import { Result, ok, err, createLogger } from '@ai-email-agent/utils';
import { GroqClient, LLMError } from '@ai-email-agent/integrations';
import { EmailDomain, Classification, ExtractedData } from '../../types/email.js';
import {
  IExtractorService,
  ExtractionError,
  ExtractionErrorCode,
  ExtractionOptions,
} from '../extractor.js';

const logger = createLogger({ service: 'extractor-service' });

/**
 * Maps LLM errors to extraction errors
 */
function mapLLMError(error: LLMError): ExtractionError {
  const codeMap: Record<string, ExtractionErrorCode> = {
    LLM_ERROR: ExtractionErrorCode.LLM_ERROR,
    PARSE_ERROR: ExtractionErrorCode.PARSE_ERROR,
    VALIDATION_ERROR: ExtractionErrorCode.PARSE_ERROR,
    TIMEOUT: ExtractionErrorCode.TIMEOUT,
    RATE_LIMITED: ExtractionErrorCode.RATE_LIMITED,
  };

  return {
    code: codeMap[error.code] ?? ExtractionErrorCode.LLM_ERROR,
    message: error.message,
    details: { retryable: error.retryable },
  };
}

/**
 * Service implementation for extracting financial data from emails using Groq LLM
 */
export class ExtractorService implements IExtractorService {
  constructor(
    private llmClient: GroqClient,
    private options: ExtractionOptions = {}
  ) {}

  /**
   * Extract structured financial data from an email
   */
  async extract(
    email: EmailDomain,
    classification: Classification
  ): Promise<Result<ExtractedData, ExtractionError>> {
    logger.info(
      { emailId: email.id, emailType: classification.emailType },
      'Extracting data from email'
    );

    // Validate input
    if (!email.bodyText && !email.bodyHtml) {
      return err({
        code: ExtractionErrorCode.INVALID_INPUT,
        message: 'Email has no body content to extract from',
        details: { emailId: email.id },
      });
    }

    // Skip extraction for irrelevant emails
    if (classification.emailType === 'irrelevant') {
      logger.info({ emailId: email.id }, 'Skipping extraction for irrelevant email');
      return ok(this.createEmptyExtraction(email));
    }

    const result = await this.llmClient.extract(email, classification);

    if (!result.ok) {
      logger.warn({ emailId: email.id, error: result.error }, 'Extraction failed');
      return err(mapLLMError(result.error));
    }

    // Check confidence threshold
    const minConfidence = this.options.minConfidence ?? 0.5;
    if (result.value.overallConfidence < minConfidence) {
      logger.warn(
        { emailId: email.id, confidence: result.value.overallConfidence, threshold: minConfidence },
        'Extraction confidence below threshold'
      );
      return err({
        code: ExtractionErrorCode.LOW_CONFIDENCE,
        message: `Extraction confidence ${result.value.overallConfidence} below threshold ${minConfidence}`,
        details: {
          confidence: result.value.overallConfidence,
          threshold: minConfidence,
          extractedData: result.value,
        },
      });
    }

    logger.info(
      {
        emailId: email.id,
        confidence: result.value.overallConfidence,
        hasVendor: !!result.value.vendorName.value,
        hasAmount: !!result.value.amount.value,
      },
      'Data extracted successfully'
    );

    return ok(result.value);
  }

  /**
   * Extract data from an attachment (PDF, image, etc.)
   * Note: This is a placeholder - full implementation would use document AI
   */
  async extractFromAttachment(
    attachmentPath: string,
    contentType: string
  ): Promise<Result<Partial<ExtractedData>, ExtractionError>> {
    logger.info({ attachmentPath, contentType }, 'Extracting from attachment');

    // For now, return an error indicating this isn't fully implemented
    // Full implementation would use document AI or PDF parsing
    return err({
      code: ExtractionErrorCode.ATTACHMENT_ERROR,
      message: 'Attachment extraction not yet implemented',
      details: { attachmentPath, contentType },
    });
  }

  /**
   * Create an empty extraction result for irrelevant emails
   */
  private createEmptyExtraction(email: EmailDomain): ExtractedData {
    const emptyField = {
      value: null,
      confidence: 0,
      source: 'inferred' as const,
    };

    return {
      vendorName: emptyField,
      amount: emptyField,
      currency: emptyField,
      dueDate: emptyField,
      invoiceNumber: emptyField,
      description: emptyField,
      lineItems: [],
      attachments: email.attachments,
      overallConfidence: 0,
      warnings: ['Email classified as irrelevant - no extraction performed'],
    };
  }
}

/**
 * Create an extractor service instance with default Groq client
 */
export function createExtractorService(
  llmClient?: GroqClient,
  options?: ExtractionOptions
): ExtractorService {
  const { groqClient } = require('@ai-email-agent/integrations');
  return new ExtractorService(llmClient ?? groqClient, options);
}
