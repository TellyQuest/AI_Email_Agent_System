import { FastifyPluginAsync } from 'fastify';
import { PgBoss } from 'pg-boss';
import { createLogger } from '@ai-email-agent/utils';
import { getEnv } from '@ai-email-agent/config';
import { emailRepository } from '@ai-email-agent/database';

const logger = createLogger({ service: 'webhook' });

const EMAIL_QUEUE = 'email-processing';

interface OutlookNotification {
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

interface WebhookPayload {
  value: OutlookNotification[];
}

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  const env = getEnv();

  // Initialize pgBoss with PostgreSQL connection
  const boss = new PgBoss(env.DATABASE_URL);

  // Start pgBoss
  await boss.start();
  logger.info('pgBoss started for webhook routes');

  // Cleanup on close
  app.addHook('onClose', async () => {
    await boss.stop();
  });

  // Outlook webhook validation (GET request with validation token)
  app.get(
    '/outlook',
    {
      schema: {
        tags: ['webhook'],
        summary: 'Outlook webhook validation',
        querystring: {
          type: 'object',
          properties: {
            validationToken: { type: 'string' },
          },
        },
        response: {
          200: { type: 'string' },
        },
      },
    },
    async (request, reply) => {
      const { validationToken } = request.query as { validationToken?: string };

      if (validationToken) {
        logger.info('Outlook webhook validation received');
        reply.type('text/plain');
        return validationToken;
      }

      return reply.status(400).send('Missing validation token');
    }
  );

  // Outlook webhook notification (POST request)
  app.post<{ Body: WebhookPayload }>(
    '/outlook',
    {
      schema: {
        tags: ['webhook'],
        summary: 'Outlook webhook notification',
        body: {
          type: 'object',
          properties: {
            value: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  subscriptionId: { type: 'string' },
                  changeType: { type: 'string' },
                  resource: { type: 'string' },
                  resourceData: { type: 'object' },
                  clientState: { type: 'string' },
                },
              },
            },
          },
        },
        response: {
          202: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              processed: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { value: notifications } = request.body;

      if (!notifications || notifications.length === 0) {
        return reply.status(202).send({ status: 'ok', processed: 0 });
      }

      let processed = 0;

      for (const notification of notifications) {
        // Validate client state
        if (notification.clientState !== 'ai-email-agent') {
          logger.warn({ clientState: notification.clientState }, 'Invalid client state');
          continue;
        }

        // Only process created emails
        if (notification.changeType !== 'created') {
          continue;
        }

        const messageId = notification.resourceData.id;

        // Check for duplicates
        const existsResult = await emailRepository.exists(messageId);
        if (existsResult.ok && existsResult.value) {
          logger.debug({ messageId }, 'Duplicate email, skipping');
          continue;
        }

        // Queue for processing via pgBoss
        await boss.send(EMAIL_QUEUE, {
          messageId,
          resource: notification.resource,
          notificationTime: new Date().toISOString(),
        }, {
          singletonKey: `email-${messageId}`,
          retryLimit: 3,
          retryBackoff: true,
        });

        logger.info({ messageId }, 'Email queued for processing');
        processed++;
      }

      return reply.status(202).send({ status: 'ok', processed });
    }
  );
};
