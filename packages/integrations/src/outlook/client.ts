import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import {
  ok,
  err,
  Result,
  withRetry,
  retryPresets,
  CircuitBreaker,
  createCircuitBreaker,
  circuitBreakerPresets,
  createLogger,
} from '@ai-email-agent/utils';
import { getEnv } from '@ai-email-agent/config';
import { EmailDomain, AttachmentInfo } from '../types.js';

const logger = createLogger({ service: 'outlook-client' });

// Outlook API errors
export interface OutlookError {
  code: string;
  message: string;
  statusCode?: number;
}

// Raw email from Graph API
interface GraphMessage {
  id: string;
  internetMessageId: string;
  conversationId: string;
  subject: string;
  from: {
    emailAddress: {
      address: string;
      name?: string;
    };
  };
  toRecipients: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
  }>;
  receivedDateTime: string;
  body: {
    contentType: string;
    content: string;
  };
  bodyPreview: string;
  hasAttachments: boolean;
  internetMessageHeaders?: Array<{
    name: string;
    value: string;
  }>;
}

interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  contentBytes?: string;
  '@odata.type': string;
}

export class OutlookClient {
  private client: Client;
  private circuitBreaker: CircuitBreaker;
  private userId: string = 'me'; // Default to authenticated user

  constructor() {
    const env = getEnv();

    const credential = new ClientSecretCredential(
      env.OUTLOOK_TENANT_ID,
      env.OUTLOOK_CLIENT_ID,
      env.OUTLOOK_CLIENT_SECRET
    );

    this.client = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => {
          const token = await credential.getToken('https://graph.microsoft.com/.default');
          return token.token;
        },
      },
    });

    this.circuitBreaker = createCircuitBreaker('outlook', circuitBreakerPresets.outlook);
  }

  setUserId(userId: string): void {
    this.userId = userId;
  }

  async getMessages(
    options: {
      folderId?: string;
      top?: number;
      skip?: number;
      filter?: string;
      orderBy?: string;
    } = {}
  ): Promise<Result<EmailDomain[], OutlookError>> {
    const {
      folderId = 'inbox',
      top = 50,
      skip = 0,
      filter,
      orderBy = 'receivedDateTime desc',
    } = options;

    const cbResult = await this.circuitBreaker.execute(async () => {
      const result = await withRetry(
        async () => {
          let request = this.client
            .api(`/users/${this.userId}/mailFolders/${folderId}/messages`)
            .top(top)
            .skip(skip)
            .orderby(orderBy)
            .select(
              'id,internetMessageId,conversationId,subject,from,toRecipients,receivedDateTime,body,bodyPreview,hasAttachments,internetMessageHeaders'
            );

          if (filter) {
            request = request.filter(filter);
          }

          return await request.get();
        },
        retryPresets.externalApi
      );

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return result.value;
    });

    if (!cbResult.ok) {
      return err({
        code: 'FETCH_ERROR',
        message: cbResult.error instanceof Error ? cbResult.error.message : String(cbResult.error),
      });
    }

    const messages: GraphMessage[] = cbResult.value.value;
    const emails = messages.map((msg) => this.mapToEmailDomain(msg));

    return ok(emails);
  }

  async getMessage(messageId: string): Promise<Result<EmailDomain, OutlookError>> {
    const cbResult = await this.circuitBreaker.execute(async () => {
      const result = await withRetry(
        async () => {
          return await this.client
            .api(`/users/${this.userId}/messages/${messageId}`)
            .select(
              'id,internetMessageId,conversationId,subject,from,toRecipients,receivedDateTime,body,bodyPreview,hasAttachments,internetMessageHeaders'
            )
            .get();
        },
        retryPresets.externalApi
      );

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return result.value;
    });

    if (!cbResult.ok) {
      return err({
        code: 'FETCH_ERROR',
        message: cbResult.error instanceof Error ? cbResult.error.message : String(cbResult.error),
      });
    }

    return ok(this.mapToEmailDomain(cbResult.value));
  }

  async getAttachments(messageId: string): Promise<Result<AttachmentInfo[], OutlookError>> {
    const cbResult = await this.circuitBreaker.execute(async () => {
      const result = await withRetry(
        async () => {
          return await this.client
            .api(`/users/${this.userId}/messages/${messageId}/attachments`)
            .get();
        },
        retryPresets.externalApi
      );

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return result.value;
    });

    if (!cbResult.ok) {
      return err({
        code: 'FETCH_ERROR',
        message: cbResult.error instanceof Error ? cbResult.error.message : String(cbResult.error),
      });
    }

    const attachments: GraphAttachment[] = cbResult.value.value;

    return ok(
      attachments
        .filter((att) => att['@odata.type'] === '#microsoft.graph.fileAttachment')
        .map((att) => ({
          id: att.id,
          filename: att.name,
          contentType: att.contentType,
          size: att.size,
          storagePath: '', // Will be set after upload to MinIO
        }))
    );
  }

  async getAttachmentContent(
    messageId: string,
    attachmentId: string
  ): Promise<Result<Buffer, OutlookError>> {
    const cbResult = await this.circuitBreaker.execute(async () => {
      const result = await withRetry(
        async () => {
          return await this.client
            .api(`/users/${this.userId}/messages/${messageId}/attachments/${attachmentId}`)
            .get();
        },
        retryPresets.externalApi
      );

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return result.value;
    });

    if (!cbResult.ok) {
      return err({
        code: 'FETCH_ERROR',
        message: cbResult.error instanceof Error ? cbResult.error.message : String(cbResult.error),
      });
    }

    const attachment: GraphAttachment = cbResult.value;

    if (!attachment.contentBytes) {
      return err({
        code: 'NO_CONTENT',
        message: 'Attachment has no content',
      });
    }

    return ok(Buffer.from(attachment.contentBytes, 'base64'));
  }

  async markAsRead(messageId: string): Promise<Result<void, OutlookError>> {
    const cbResult = await this.circuitBreaker.execute(async () => {
      const result = await withRetry(
        async () => {
          await this.client.api(`/users/${this.userId}/messages/${messageId}`).patch({
            isRead: true,
          });
        },
        retryPresets.externalApi
      );

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return result.value;
    });

    if (!cbResult.ok) {
      return err({
        code: 'UPDATE_ERROR',
        message: cbResult.error instanceof Error ? cbResult.error.message : String(cbResult.error),
      });
    }

    return ok(undefined);
  }

  async createSubscription(
    notificationUrl: string,
    resource: string = `/users/${this.userId}/mailFolders/inbox/messages`,
    expirationMinutes: number = 4230 // Max for mail is ~3 days
  ): Promise<Result<string, OutlookError>> {
    const expirationDateTime = new Date(
      Date.now() + expirationMinutes * 60 * 1000
    ).toISOString();

    const cbResult = await this.circuitBreaker.execute(async () => {
      const result = await withRetry(
        async () => {
          return await this.client.api('/subscriptions').post({
            changeType: 'created',
            notificationUrl,
            resource,
            expirationDateTime,
            clientState: 'ai-email-agent',
          });
        },
        retryPresets.externalApi
      );

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return result.value;
    });

    if (!cbResult.ok) {
      return err({
        code: 'SUBSCRIPTION_ERROR',
        message: cbResult.error instanceof Error ? cbResult.error.message : String(cbResult.error),
      });
    }

    logger.info({ subscriptionId: cbResult.value.id }, 'Created webhook subscription');
    return ok(cbResult.value.id);
  }

  async renewSubscription(subscriptionId: string): Promise<Result<void, OutlookError>> {
    const expirationDateTime = new Date(
      Date.now() + 4230 * 60 * 1000
    ).toISOString();

    const cbResult = await this.circuitBreaker.execute(async () => {
      const result = await withRetry(
        async () => {
          await this.client.api(`/subscriptions/${subscriptionId}`).patch({
            expirationDateTime,
          });
        },
        retryPresets.externalApi
      );

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return result.value;
    });

    if (!cbResult.ok) {
      return err({
        code: 'SUBSCRIPTION_ERROR',
        message: cbResult.error instanceof Error ? cbResult.error.message : String(cbResult.error),
      });
    }

    return ok(undefined);
  }

  async deleteSubscription(subscriptionId: string): Promise<Result<void, OutlookError>> {
    const cbResult = await this.circuitBreaker.execute(async () => {
      const result = await withRetry(
        async () => {
          await this.client.api(`/subscriptions/${subscriptionId}`).delete();
        },
        retryPresets.externalApi
      );

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return result.value;
    });

    if (!cbResult.ok) {
      return err({
        code: 'SUBSCRIPTION_ERROR',
        message: cbResult.error instanceof Error ? cbResult.error.message : String(cbResult.error),
      });
    }

    return ok(undefined);
  }

  private mapToEmailDomain(msg: GraphMessage): EmailDomain {
    const headers: Record<string, string> = {};
    if (msg.internetMessageHeaders) {
      for (const header of msg.internetMessageHeaders) {
        headers[header.name] = header.value;
      }
    }

    return {
      id: msg.id,
      messageId: msg.internetMessageId,
      conversationId: msg.conversationId,
      subject: msg.subject,
      senderEmail: msg.from.emailAddress.address,
      senderName: msg.from.emailAddress.name ?? null,
      recipientEmail: msg.toRecipients[0]?.emailAddress.address ?? '',
      receivedAt: new Date(msg.receivedDateTime),
      bodyText: msg.body.contentType === 'text' ? msg.body.content : this.stripHtml(msg.body.content),
      bodyHtml: msg.body.contentType === 'html' ? msg.body.content : null,
      hasAttachments: msg.hasAttachments,
      attachments: [], // Loaded separately
      status: 'pending',
      classification: null,
      clientId: null,
      matchMethod: null,
      matchConfidence: null,
      extractedData: null,
    };
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

export const outlookClient = new OutlookClient();
