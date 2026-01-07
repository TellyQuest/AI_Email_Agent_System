import { Result, ok, err, createLogger } from '@ai-email-agent/utils';
import { GroqClient, LLMError } from '@ai-email-agent/integrations';
import { EmailDomain, Classification } from '../../types/email.js';
import {
  IClassifierService,
  ClassificationError,
  ClassificationErrorCode,
  ClassificationOptions,
} from '../classifier.js';

const logger = createLogger({ service: 'classifier-service' });

/**
 * Maps LLM errors to classification errors
 */
function mapLLMError(error: LLMError): ClassificationError {
  const codeMap: Record<string, ClassificationErrorCode> = {
    LLM_ERROR: ClassificationErrorCode.LLM_ERROR,
    PARSE_ERROR: ClassificationErrorCode.PARSE_ERROR,
    VALIDATION_ERROR: ClassificationErrorCode.PARSE_ERROR,
    TIMEOUT: ClassificationErrorCode.TIMEOUT,
    RATE_LIMITED: ClassificationErrorCode.RATE_LIMITED,
  };

  return {
    code: codeMap[error.code] ?? ClassificationErrorCode.LLM_ERROR,
    message: error.message,
    details: { retryable: error.retryable },
  };
}

/**
 * Service implementation for email classification using Groq LLM
 */
export class ClassifierService implements IClassifierService {
  constructor(
    private llmClient: GroqClient,
    private options: ClassificationOptions = {}
  ) {}

  /**
   * Classify an email to determine its type and intent
   */
  async classify(email: EmailDomain): Promise<Result<Classification, ClassificationError>> {
    logger.info({ emailId: email.id, subject: email.subject }, 'Classifying email');

    // Validate input
    if (!email.bodyText && !email.bodyHtml) {
      return err({
        code: ClassificationErrorCode.INVALID_INPUT,
        message: 'Email has no body content to classify',
        details: { emailId: email.id },
      });
    }

    const result = await this.llmClient.classify(email);

    if (!result.ok) {
      logger.warn({ emailId: email.id, error: result.error }, 'Classification failed');
      return err(mapLLMError(result.error));
    }

    logger.info(
      {
        emailId: email.id,
        type: result.value.emailType,
        confidence: result.value.confidence,
      },
      'Email classified successfully'
    );

    return ok(result.value);
  }

  /**
   * Classify multiple emails in batch
   */
  async classifyBatch(emails: EmailDomain[]): Promise<Result<Classification[], ClassificationError>> {
    logger.info({ count: emails.length }, 'Batch classifying emails');

    const results: Classification[] = [];

    for (const email of emails) {
      const result = await this.classify(email);
      if (!result.ok) {
        // Return error on first failure
        return err(result.error);
      }
      results.push(result.value);
    }

    return ok(results);
  }
}

/**
 * Create a classifier service instance with default Groq client
 */
export function createClassifierService(
  llmClient?: GroqClient,
  options?: ClassificationOptions
): ClassifierService {
  const { groqClient } = require('@ai-email-agent/integrations');
  return new ClassifierService(llmClient ?? groqClient, options);
}
