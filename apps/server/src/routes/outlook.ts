import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { outlookClient } from '@ai-email-agent/integrations';
import { createLogger } from '@ai-email-agent/utils';

const logger = createLogger({ service: 'outlook-routes' });

const createSubscriptionSchema = z.object({
  notificationUrl: z.string().url(),
  userId: z.string().optional(),
  resource: z.string().optional(),
  expirationMinutes: z.number().min(1).max(4230).optional(),
});

const subscriptionIdSchema = z.object({
  subscriptionId: z.string().min(1),
});

export const outlookRoutes: FastifyPluginAsync = async (app) => {
  // Create a new webhook subscription
  app.post(
    '/subscriptions',
    {
      schema: {
        tags: ['outlook'],
        summary: 'Create Outlook webhook subscription',
        description: 'Creates a new webhook subscription for incoming emails. The notificationUrl must be publicly accessible and return the validation token.',
        body: {
          type: 'object',
          properties: {
            notificationUrl: { type: 'string', format: 'uri' },
            userId: { type: 'string', description: 'User ID or email (defaults to "me")' },
            resource: { type: 'string', description: 'Graph resource to subscribe to' },
            expirationMinutes: { type: 'number', description: 'Minutes until expiration (max 4230)' },
          },
          required: ['notificationUrl'],
        },
        response: {
          201: {
            type: 'object',
            properties: {
              subscriptionId: { type: 'string' },
              expiresAt: { type: 'string' },
              message: { type: 'string' },
            },
          },
          400: {
            type: 'object',
            properties: { error: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const data = createSubscriptionSchema.parse(request.body);

      // Set user ID if provided
      if (data.userId) {
        outlookClient.setUserId(data.userId);
      }

      const result = await outlookClient.createSubscription(
        data.notificationUrl,
        data.resource,
        data.expirationMinutes
      );

      if (!result.ok) {
        logger.error({ error: result.error }, 'Failed to create subscription');
        return reply.status(400).send({ error: result.error.message });
      }

      const expiresAt = new Date(
        Date.now() + (data.expirationMinutes ?? 4230) * 60 * 1000
      ).toISOString();

      logger.info({ subscriptionId: result.value }, 'Webhook subscription created');

      return reply.status(201).send({
        subscriptionId: result.value,
        expiresAt,
        message: 'Subscription created successfully. Remember to renew before expiration.',
      });
    }
  );

  // Renew an existing subscription
  app.patch(
    '/subscriptions/:subscriptionId',
    {
      schema: {
        tags: ['outlook'],
        summary: 'Renew Outlook webhook subscription',
        description: 'Extends the expiration of an existing subscription by ~3 days.',
        params: {
          type: 'object',
          properties: {
            subscriptionId: { type: 'string' },
          },
          required: ['subscriptionId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              expiresAt: { type: 'string' },
            },
          },
          400: {
            type: 'object',
            properties: { error: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const { subscriptionId } = subscriptionIdSchema.parse(request.params);

      const result = await outlookClient.renewSubscription(subscriptionId);

      if (!result.ok) {
        logger.error({ subscriptionId, error: result.error }, 'Failed to renew subscription');
        return reply.status(400).send({ error: result.error.message });
      }

      const expiresAt = new Date(Date.now() + 4230 * 60 * 1000).toISOString();

      logger.info({ subscriptionId }, 'Webhook subscription renewed');

      return {
        message: 'Subscription renewed successfully',
        expiresAt,
      };
    }
  );

  // Delete a subscription
  app.delete(
    '/subscriptions/:subscriptionId',
    {
      schema: {
        tags: ['outlook'],
        summary: 'Delete Outlook webhook subscription',
        params: {
          type: 'object',
          properties: {
            subscriptionId: { type: 'string' },
          },
          required: ['subscriptionId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
          400: {
            type: 'object',
            properties: { error: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const { subscriptionId } = subscriptionIdSchema.parse(request.params);

      const result = await outlookClient.deleteSubscription(subscriptionId);

      if (!result.ok) {
        logger.error({ subscriptionId, error: result.error }, 'Failed to delete subscription');
        return reply.status(400).send({ error: result.error.message });
      }

      logger.info({ subscriptionId }, 'Webhook subscription deleted');

      return { message: 'Subscription deleted successfully' };
    }
  );

  // Test endpoint to manually trigger email polling
  app.post(
    '/poll',
    {
      schema: {
        tags: ['outlook'],
        summary: 'Manually poll for new emails',
        description: 'Triggers manual polling of emails. Useful for testing or when webhooks fail.',
        body: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            folderId: { type: 'string', default: 'inbox' },
            top: { type: 'number', default: 10 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              emailCount: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { userId?: string; folderId?: string; top?: number };

      if (body.userId) {
        outlookClient.setUserId(body.userId);
      }

      const result = await outlookClient.getMessages({
        folderId: body.folderId ?? 'inbox',
        top: body.top ?? 10,
      });

      if (!result.ok) {
        return reply.status(400).send({ error: result.error.message });
      }

      return {
        message: 'Poll completed',
        emailCount: result.value.length,
        emails: result.value.map((e) => ({
          id: e.id,
          subject: e.subject,
          from: e.senderEmail,
          receivedAt: e.receivedAt,
        })),
      };
    }
  );
};
