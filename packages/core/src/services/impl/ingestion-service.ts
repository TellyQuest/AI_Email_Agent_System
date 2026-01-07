import { Result, ok, err, createLogger } from '@ai-email-agent/utils';
import {
  OutlookClient,
  MinioClient,
  OutlookError,
  StorageError,
} from '@ai-email-agent/integrations';
import { EmailRepository } from '@ai-email-agent/database';
import { EmailDomain, AttachmentInfo } from '../../types/email.js';
import {
  IIngestionService,
  IngestionError,
  IngestionErrorCode,
  IngestionOptions,
  WebhookNotification,
} from '../ingestion.js';

const logger = createLogger({ service: 'ingestion-service' });

/**
 * Map Outlook errors to ingestion errors
 */
function mapOutlookError(error: OutlookError): IngestionError {
  const codeMap: Record<string, IngestionErrorCode> = {
    FETCH_ERROR: IngestionErrorCode.FETCH_ERROR,
    AUTH_ERROR: IngestionErrorCode.AUTH_ERROR,
    NOT_FOUND: IngestionErrorCode.FETCH_ERROR,
    THROTTLED: IngestionErrorCode.RATE_LIMITED,
  };

  return {
    code: codeMap[error.code] ?? IngestionErrorCode.FETCH_ERROR,
    message: error.message,
    details: { outlookCode: error.code, statusCode: error.statusCode },
  };
}

/**
 * Map storage errors to ingestion errors
 */
function mapStorageError(error: StorageError): IngestionError {
  return {
    code: IngestionErrorCode.STORAGE_ERROR,
    message: error.message,
    details: { storageCode: error.code },
  };
}

/**
 * Service implementation for ingesting emails from Outlook
 */
export class IngestionService implements IIngestionService {
  constructor(
    private outlook: OutlookClient,
    private storage: MinioClient,
    private emailRepository: EmailRepository,
    private options: IngestionOptions = {}
  ) {}

  /**
   * Handle incoming webhook notification from Outlook
   */
  async handleWebhook(notification: WebhookNotification): Promise<Result<void, IngestionError>> {
    logger.info(
      {
        subscriptionId: notification.subscriptionId,
        changeType: notification.changeType,
        resourceId: notification.resourceData.id,
      },
      'Processing webhook notification'
    );

    // Only process new email notifications
    if (notification.changeType !== 'created') {
      logger.debug({ changeType: notification.changeType }, 'Ignoring non-creation change');
      return ok(undefined);
    }

    // Extract message ID from resource
    const messageId = notification.resourceData.id;

    // Check for duplicate
    if (await this.isDuplicate(messageId)) {
      logger.debug({ messageId }, 'Skipping duplicate email');
      return ok(undefined);
    }

    // Fetch and process the email
    const fetchResult = await this.fetchEmail(messageId);
    if (!fetchResult.ok) {
      return err(fetchResult.error);
    }

    // Store attachments if present
    let email = fetchResult.value;
    if (email.hasAttachments) {
      const attachResult = await this.storeAttachments(email);
      if (!attachResult.ok) {
        logger.warn(
          { messageId, error: attachResult.error },
          'Failed to store attachments, continuing without them'
        );
      } else {
        email = attachResult.value;
      }
    }

    // Save email to database (attachments stored in separate table)
    const saveResult = await this.emailRepository.create({
      id: email.id,
      messageId: email.messageId,
      conversationId: email.conversationId,
      subject: email.subject,
      senderEmail: email.senderEmail,
      senderName: email.senderName,
      recipientEmail: email.recipientEmail,
      receivedAt: email.receivedAt,
      bodyText: email.bodyText,
      bodyHtml: email.bodyHtml,
      hasAttachments: email.hasAttachments,
      status: 'pending',
    });

    if (!saveResult.ok) {
      return err({
        code: IngestionErrorCode.STORAGE_ERROR,
        message: saveResult.error.message,
        details: { messageId },
      });
    }

    logger.info({ emailId: email.id, messageId }, 'Email ingested successfully');
    return ok(undefined);
  }

  /**
   * Poll for new emails (fallback when webhooks fail)
   */
  async poll(): Promise<Result<EmailDomain[], IngestionError>> {
    logger.info({ options: this.options }, 'Polling for new emails');

    const folders = this.options.folders ?? ['inbox'];
    const allEmails: EmailDomain[] = [];

    for (const folder of folders) {
      // Build filter for new emails
      let filter: string | undefined;
      if (this.options.sinceDate) {
        filter = `receivedDateTime ge ${this.options.sinceDate.toISOString()}`;
      }

      const result = await this.outlook.getMessages({
        folderId: folder,
        top: this.options.maxEmails ?? 50,
        filter,
        orderBy: 'receivedDateTime desc',
      });

      if (!result.ok) {
        logger.warn({ folder, error: result.error }, 'Failed to fetch from folder');
        continue;
      }

      // Filter out duplicates
      const newEmails: EmailDomain[] = [];
      for (const email of result.value) {
        if (!(await this.isDuplicate(email.messageId))) {
          newEmails.push(email);
        }
      }

      // Process and store each email
      for (const email of newEmails) {
        let processedEmail = email;

        // Store attachments
        if (email.hasAttachments) {
          const attachResult = await this.storeAttachments(email);
          if (attachResult.ok) {
            processedEmail = attachResult.value;
          }
        }

        // Save to database (attachments stored in separate table)
        const saveResult = await this.emailRepository.create({
          id: processedEmail.id,
          messageId: processedEmail.messageId,
          conversationId: processedEmail.conversationId,
          subject: processedEmail.subject,
          senderEmail: processedEmail.senderEmail,
          senderName: processedEmail.senderName,
          recipientEmail: processedEmail.recipientEmail,
          receivedAt: processedEmail.receivedAt,
          bodyText: processedEmail.bodyText,
          bodyHtml: processedEmail.bodyHtml,
          hasAttachments: processedEmail.hasAttachments,
          status: 'pending',
        });

        if (saveResult.ok) {
          allEmails.push(processedEmail);
        } else {
          logger.warn(
            { messageId: email.messageId, error: saveResult.error },
            'Failed to save email'
          );
        }
      }

      logger.info({ folder, count: newEmails.length }, 'Fetched emails from folder');
    }

    logger.info({ totalCount: allEmails.length }, 'Poll completed');
    return ok(allEmails);
  }

  /**
   * Fetch a specific email by ID
   */
  async fetchEmail(messageId: string): Promise<Result<EmailDomain, IngestionError>> {
    logger.debug({ messageId }, 'Fetching email');

    const result = await this.outlook.getMessage(messageId);
    if (!result.ok) {
      return err(mapOutlookError(result.error));
    }

    return ok(result.value);
  }

  /**
   * Check if an email was already processed
   */
  async isDuplicate(messageId: string): Promise<boolean> {
    const result = await this.emailRepository.exists(messageId);
    if (!result.ok) {
      logger.warn({ messageId, error: result.error }, 'Error checking for duplicate');
      return false; // Assume not duplicate on error to avoid missing emails
    }
    return result.value;
  }

  /**
   * Store email attachments in MinIO
   */
  async storeAttachments(email: EmailDomain): Promise<Result<EmailDomain, IngestionError>> {
    logger.debug({ emailId: email.id, hasAttachments: email.hasAttachments }, 'Storing attachments');

    if (!email.hasAttachments) {
      return ok(email);
    }

    // Get attachment metadata from Outlook
    const attachmentsResult = await this.outlook.getAttachments(email.id);
    if (!attachmentsResult.ok) {
      return err(mapOutlookError(attachmentsResult.error));
    }

    const storedAttachments: AttachmentInfo[] = [];

    for (const attachment of attachmentsResult.value) {
      // Download attachment content
      const contentResult = await this.outlook.getAttachmentContent(email.id, attachment.id);
      if (!contentResult.ok) {
        logger.warn(
          { emailId: email.id, attachmentId: attachment.id, error: contentResult.error },
          'Failed to download attachment'
        );
        continue;
      }

      // Upload to MinIO
      const uploadResult = await this.storage.uploadAttachment(
        email.id,
        attachment.id,
        attachment.filename,
        contentResult.value,
        attachment.contentType
      );

      if (!uploadResult.ok) {
        logger.warn(
          { emailId: email.id, attachmentId: attachment.id, error: uploadResult.error },
          'Failed to upload attachment'
        );
        continue;
      }

      storedAttachments.push({
        id: attachment.id,
        filename: attachment.filename,
        contentType: attachment.contentType,
        size: attachment.size,
        storagePath: uploadResult.value.path,
      });
    }

    logger.info(
      { emailId: email.id, attachmentCount: storedAttachments.length },
      'Attachments stored'
    );

    return ok({
      ...email,
      attachments: storedAttachments,
    });
  }
}

/**
 * Create an ingestion service instance
 */
export function createIngestionService(
  outlook?: OutlookClient,
  storage?: MinioClient,
  emailRepo?: EmailRepository,
  options?: IngestionOptions
): IngestionService {
  const {
    outlookClient,
    minioClient,
  } = require('@ai-email-agent/integrations');
  const { emailRepository } = require('@ai-email-agent/database');

  return new IngestionService(
    outlook ?? outlookClient,
    storage ?? minioClient,
    emailRepo ?? emailRepository,
    options
  );
}
