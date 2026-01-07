import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { actionRepository, auditRepository, ActionFilters } from '@ai-email-agent/database';
import { getEnv } from '@ai-email-agent/config';
import { createLogger } from '@ai-email-agent/utils';

const logger = createLogger({ service: 'actions-route' });

const actionQuerySchema = z.object({
  status: z.string().optional(),
  emailId: z.string().uuid().optional(),
  riskLevel: z.string().optional(),
  requiresApproval: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const actionIdSchema = z.object({
  id: z.string().uuid(),
});

const approvalSchema = z.object({
  approverId: z.string().uuid(),
});

const rejectionSchema = z.object({
  rejectedBy: z.string().uuid(),
  reason: z.string().min(1),
});

export const actionRoutes: FastifyPluginAsync = async (app) => {
  const env = getEnv();
  const redis = new Redis.default(env.REDIS_URL, { maxRetriesPerRequest: null });
  const executionQueue = new Queue('action-execution', { connection: redis });

  app.addHook('onClose', async () => {
    await executionQueue.close();
    await redis.quit();
  });

  // List actions
  app.get(
    '/',
    {
      schema: {
        tags: ['actions'],
        summary: 'List actions',
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            emailId: { type: 'string', format: 'uuid' },
            riskLevel: { type: 'string' },
            requiresApproval: { type: 'string' },
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
      const query = actionQuerySchema.parse(request.query);

      const filters: ActionFilters = {
        limit: query.limit,
        offset: query.offset,
      };

      if (query.status) {
        filters.status = query.status as ActionFilters['status'];
      }
      if (query.emailId) {
        filters.emailId = query.emailId;
      }
      if (query.riskLevel) {
        filters.riskLevel = query.riskLevel as ActionFilters['riskLevel'];
      }
      if (query.requiresApproval !== undefined) {
        filters.requiresApproval = query.requiresApproval;
      }

      const result = await actionRepository.findMany(filters);

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

  // Get pending approvals
  app.get(
    '/pending',
    {
      schema: {
        tags: ['actions'],
        summary: 'Get actions pending approval',
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array' },
              total: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await actionRepository.findPendingApprovals();

      if (!result.ok) {
        return reply.status(500).send({ error: result.error.message });
      }

      return {
        data: result.value,
        total: result.value.length,
      };
    }
  );

  // Get action by ID
  app.get(
    '/:id',
    {
      schema: {
        tags: ['actions'],
        summary: 'Get action by ID with context',
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
      const { id } = actionIdSchema.parse(request.params);

      const result = await actionRepository.findByIdWithContext(id);

      if (!result.ok) {
        return reply.status(500).send({ error: result.error.message });
      }

      if (!result.value) {
        return reply.status(404).send({ error: 'Action not found' });
      }

      return result.value;
    }
  );

  // Approve action
  app.post(
    '/:id/approve',
    {
      schema: {
        tags: ['actions'],
        summary: 'Approve an action',
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
            approverId: { type: 'string', format: 'uuid' },
          },
          required: ['approverId'],
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
      const { id } = actionIdSchema.parse(request.params);
      const { approverId } = approvalSchema.parse(request.body);

      // Get action first
      const actionResult = await actionRepository.findById(id);
      if (!actionResult.ok) {
        return reply.status(500).send({ error: actionResult.error.message });
      }
      if (!actionResult.value) {
        return reply.status(404).send({ error: 'Action not found' });
      }

      const action = actionResult.value;

      // Validate current state
      if (action.status !== 'pending') {
        return reply.status(400).send({ error: `Cannot approve action in status: ${action.status}` });
      }

      // Approve
      const approveResult = await actionRepository.approve(id, approverId);
      if (!approveResult.ok) {
        return reply.status(500).send({ error: approveResult.error.message });
      }

      // Log audit
      await auditRepository.logActionEvent('action.approved', id, action.emailId, `Action approved by ${approverId}`, {
        userId: approverId,
        oldValue: { status: action.status },
        newValue: { status: 'approved' },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      // Queue for execution
      await executionQueue.add(
        'execute-action',
        { actionId: id },
        {
          jobId: `action-${id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        }
      );

      logger.info({ actionId: id, approverId }, 'Action approved and queued for execution');

      return approveResult.value;
    }
  );

  // Reject action
  app.post(
    '/:id/reject',
    {
      schema: {
        tags: ['actions'],
        summary: 'Reject an action',
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
            rejectedBy: { type: 'string', format: 'uuid' },
            reason: { type: 'string' },
          },
          required: ['rejectedBy', 'reason'],
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
      const { id } = actionIdSchema.parse(request.params);
      const { rejectedBy, reason } = rejectionSchema.parse(request.body);

      // Get action first
      const actionResult = await actionRepository.findById(id);
      if (!actionResult.ok) {
        return reply.status(500).send({ error: actionResult.error.message });
      }
      if (!actionResult.value) {
        return reply.status(404).send({ error: 'Action not found' });
      }

      const action = actionResult.value;

      // Validate current state
      if (action.status !== 'pending') {
        return reply.status(400).send({ error: `Cannot reject action in status: ${action.status}` });
      }

      // Reject
      const rejectResult = await actionRepository.reject(id, rejectedBy, reason);
      if (!rejectResult.ok) {
        return reply.status(500).send({ error: rejectResult.error.message });
      }

      // Log audit
      await auditRepository.logActionEvent('action.rejected', id, action.emailId, `Action rejected: ${reason}`, {
        userId: rejectedBy,
        oldValue: { status: action.status },
        newValue: { status: 'rejected', reason },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      logger.info({ actionId: id, rejectedBy, reason }, 'Action rejected');

      return rejectResult.value;
    }
  );

  // Get action status counts
  app.get(
    '/stats/status',
    {
      schema: {
        tags: ['actions'],
        summary: 'Get action status counts',
        response: {
          200: {
            type: 'object',
            additionalProperties: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await actionRepository.countByStatus();

      if (!result.ok) {
        return reply.status(500).send({ error: result.error.message });
      }

      return result.value;
    }
  );
};
