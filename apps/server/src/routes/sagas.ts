import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sagaRepository, SagaFilters } from '@ai-email-agent/database';

const sagaQuerySchema = z.object({
  status: z.string().optional(),
  emailId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const sagaIdSchema = z.object({
  id: z.string().uuid(),
});

export const sagaRoutes: FastifyPluginAsync = async (app) => {
  // List sagas
  app.get(
    '/',
    {
      schema: {
        tags: ['sagas'],
        summary: 'List sagas',
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            emailId: { type: 'string', format: 'uuid' },
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
      const query = sagaQuerySchema.parse(request.query);

      const filters: SagaFilters = {
        limit: query.limit,
        offset: query.offset,
      };

      if (query.status) {
        filters.status = query.status as SagaFilters['status'];
      }
      if (query.emailId) {
        filters.emailId = query.emailId;
      }

      const result = await sagaRepository.findMany(filters);

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

  // Get saga by ID
  app.get(
    '/:id',
    {
      schema: {
        tags: ['sagas'],
        summary: 'Get saga by ID',
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
      const { id } = sagaIdSchema.parse(request.params);

      const result = await sagaRepository.findById(id);

      if (!result.ok) {
        return reply.status(500).send({ error: result.error.message });
      }

      if (!result.value) {
        return reply.status(404).send({ error: 'Saga not found' });
      }

      return result.value;
    }
  );

  // Get sagas for an email
  app.get(
    '/email/:emailId',
    {
      schema: {
        tags: ['sagas'],
        summary: 'Get sagas for an email',
        params: {
          type: 'object',
          properties: {
            emailId: { type: 'string', format: 'uuid' },
          },
          required: ['emailId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { emailId } = request.params as { emailId: string };

      const result = await sagaRepository.findByEmailId(emailId);

      if (!result.ok) {
        return reply.status(500).send({ error: result.error.message });
      }

      return { data: result.value };
    }
  );

  // Get sagas pending compensation
  app.get(
    '/pending-compensation',
    {
      schema: {
        tags: ['sagas'],
        summary: 'Get sagas pending compensation',
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await sagaRepository.findPendingCompensation();

      if (!result.ok) {
        return reply.status(500).send({ error: result.error.message });
      }

      return { data: result.value };
    }
  );
};
