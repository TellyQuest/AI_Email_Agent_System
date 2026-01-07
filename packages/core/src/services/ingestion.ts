import { Result } from '@ai-email-agent/utils';
import { EmailDomain } from '../types/email.js';

// Ingestion errors
export const IngestionErrorCode = {
  FETCH_ERROR: 'FETCH_ERROR',
  PARSE_ERROR: 'PARSE_ERROR',
  DUPLICATE: 'DUPLICATE',
  STORAGE_ERROR: 'STORAGE_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  AUTH_ERROR: 'AUTH_ERROR',
} as const;
export type IngestionErrorCode = (typeof IngestionErrorCode)[keyof typeof IngestionErrorCode];

export interface IngestionError {
  code: IngestionErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

// Webhook notification from Outlook
export interface WebhookNotification {
  subscriptionId: string;
  subscriptionExpirationDateTime: string;
  changeType: 'created' | 'updated' | 'deleted';
  resource: string;
  resourceData: {
    '@odata.type': string;
    '@odata.id': string;
    '@odata.etag': string;
    id: string;
  };
  clientState?: string;
  tenantId: string;
}

// Ingestion service interface
export interface IIngestionService {
  /**
   * Handle incoming webhook notification from Outlook
   */
  handleWebhook(notification: WebhookNotification): Promise<Result<void, IngestionError>>;

  /**
   * Poll for new emails (fallback when webhooks fail)
   */
  poll(): Promise<Result<EmailDomain[], IngestionError>>;

  /**
   * Fetch a specific email by ID
   */
  fetchEmail(messageId: string): Promise<Result<EmailDomain, IngestionError>>;

  /**
   * Check if an email was already processed
   */
  isDuplicate(messageId: string): Promise<boolean>;

  /**
   * Store email attachments
   */
  storeAttachments(email: EmailDomain): Promise<Result<EmailDomain, IngestionError>>;
}

// Ingestion options
export interface IngestionOptions {
  // Folders to monitor
  folders?: string[];
  // Include emails from before this date
  sinceDate?: Date;
  // Maximum emails per poll
  maxEmails?: number;
  // Include spam/junk
  includeJunk?: boolean;
}

// Subscription management
export interface ISubscriptionManager {
  /**
   * Create or renew webhook subscription
   */
  subscribe(options: SubscriptionOptions): Promise<Result<string, IngestionError>>;

  /**
   * Remove webhook subscription
   */
  unsubscribe(subscriptionId: string): Promise<Result<void, IngestionError>>;

  /**
   * List active subscriptions
   */
  listSubscriptions(): Promise<Result<SubscriptionInfo[], IngestionError>>;
}

export interface SubscriptionOptions {
  resource: string;
  changeTypes: string[];
  notificationUrl: string;
  expirationMinutes?: number;
  clientState?: string;
}

export interface SubscriptionInfo {
  id: string;
  resource: string;
  changeTypes: string[];
  expirationDateTime: Date;
  clientState?: string;
}
