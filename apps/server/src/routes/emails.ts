import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { emailRepository, EmailFilters, EmailStatus } from '@ai-email-agent/database';

const emailQuerySchema = z.object({
  status: z.string().optional(),
  clientId: z.string().uuid().optional(),
  senderEmail: z.string().email().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const emailIdSchema = z.object({
  id: z.string().uuid(),
});

export const emailRoutes: FastifyPluginAsync = async (app) => {
  // List emails
  app.get(
    '/',
    {
      schema: {
        tags: ['emails'],
        summary: 'List emails',
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            clientId: { type: 'string', format: 'uuid' },
            senderEmail: { type: 'string', format: 'email' },
            limit: { type: 'number', default: 50 },
            offset: { type: 'number', default: 0 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array' },
              total: { type: 'number' },
              limit: { type: 'number' },
              offset: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const query = emailQuerySchema.parse(request.query);

      const filters: EmailFilters = {
        limit: query.limit,
        offset: query.offset,
      };

      if (query.status) {
        filters.status = query.status as EmailFilters['status'];
      }
      if (query.clientId) {
        filters.clientId = query.clientId;
      }
      if (query.senderEmail) {
        filters.senderEmail = query.senderEmail;
      }

      const result = await emailRepository.findMany(filters);

      if (!result.ok) {
        return reply.status(500).send({ error: result.error.message });
      }

      return {
        data: result.value,
        total: result.value.length,
        limit: query.limit,
        offset: query.offset,
      };
    }
  );

  // Get email by ID
  app.get(
    '/:id',
    {
      schema: {
        tags: ['emails'],
        summary: 'Get email by ID',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        response: {
          200: { type: 'object' },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = emailIdSchema.parse(request.params);

      const result = await emailRepository.findById(id);

      if (!result.ok) {
        return reply.status(500).send({ error: result.error.message });
      }

      if (!result.value) {
        return reply.status(404).send({ error: 'Email not found' });
      }

      return result.value;
    }
  );

  // Get email status counts
  app.get(
    '/stats/status',
    {
      schema: {
        tags: ['emails'],
        summary: 'Get email status counts',
        response: {
          200: {
            type: 'object',
            additionalProperties: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await emailRepository.countByStatus();

      if (!result.ok) {
        return reply.status(500).send({ error: result.error.message });
      }

      return result.value;
    }
  );

  // Update email status
  app.patch(
    '/:id/status',
    {
      schema: {
        tags: ['emails'],
        summary: 'Update email status',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            status: { type: 'string' },
          },
          required: ['status'],
        },
        response: {
          200: { type: 'object' },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = emailIdSchema.parse(request.params);
      const { status } = request.body as { status: string };

      const result = await emailRepository.updateStatus(id, status as EmailStatus);

      if (!result.ok) {
        if (result.error.message.includes('not found')) {
          return reply.status(404).send({ error: 'Email not found' });
        }
        return reply.status(500).send({ error: result.error.message });
      }

      return result.value;
    }
  );
};
