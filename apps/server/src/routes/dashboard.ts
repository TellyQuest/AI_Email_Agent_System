import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { emailRepository, actionRepository, auditRepository } from '@ai-email-agent/database';

const timeRangeSchema = z.object({
  hours: z.coerce.number().min(1).max(168).default(24), // Max 7 days
});

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  // Get dashboard summary
  app.get(
    '/summary',
    {
      schema: {
        tags: ['dashboard'],
        summary: 'Get dashboard summary statistics',
        response: {
          200: {
            type: 'object',
            properties: {
              emails: {
                type: 'object',
                properties: {
                  pending: { type: 'number' },
                  processing: { type: 'number' },
                  completed: { type: 'number' },
                  failed: { type: 'number' },
                },
              },
              actions: {
                type: 'object',
                properties: {
                  pending: { type: 'number' },
                  pendingApproval: { type: 'number' },
                  completed: { type: 'number' },
                  failed: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const [emailStats, actionStats] = await Promise.all([
        emailRepository.countByStatus(),
        actionRepository.countByStatus(),
      ]);

      if (!emailStats.ok) {
        return reply.status(500).send({ error: emailStats.error.message });
      }

      if (!actionStats.ok) {
        return reply.status(500).send({ error: actionStats.error.message });
      }

      // Get pending approvals count
      const pendingApprovalsResult = await actionRepository.findPendingApprovals(1000);
      const pendingApprovalCount = pendingApprovalsResult.ok ? pendingApprovalsResult.value.length : 0;

      return {
        emails: {
          pending: emailStats.value.pending ?? 0,
          processing: emailStats.value.processing ?? 0,
          completed: emailStats.value.completed ?? 0,
          failed: emailStats.value.failed ?? 0,
        },
        actions: {
          pending: actionStats.value.pending ?? 0,
          pendingApproval: pendingApprovalCount,
          completed: actionStats.value.completed ?? 0,
          failed: actionStats.value.failed ?? 0,
        },
      };
    }
  );

  // Get recent activity
  app.get(
    '/activity',
    {
      schema: {
        tags: ['dashboard'],
        summary: 'Get recent activity',
        querystring: {
          type: 'object',
          properties: {
            hours: { type: 'number', default: 24 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              events: { type: 'array' },
              counts: { type: 'object' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { hours } = timeRangeSchema.parse(request.query);

      const [recentActivity, eventCounts] = await Promise.all([
        auditRepository.getRecentActivity(hours, 100),
        auditRepository.countByEventType(new Date(Date.now() - hours * 60 * 60 * 1000)),
      ]);

      if (!recentActivity.ok) {
        return reply.status(500).send({ error: recentActivity.error.message });
      }

      if (!eventCounts.ok) {
        return reply.status(500).send({ error: eventCounts.error.message });
      }

      return {
        events: recentActivity.value,
        counts: eventCounts.value,
      };
    }
  );

  // Get pending reviews for dashboard
  app.get(
    '/reviews',
    {
      schema: {
        tags: ['dashboard'],
        summary: 'Get pending reviews for dashboard',
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', default: 20 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              reviews: { type: 'array' },
              total: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { limit } = request.query as { limit?: number };

      const result = await actionRepository.findPendingApprovals(limit ?? 20);

      if (!result.ok) {
        return reply.status(500).send({ error: result.error.message });
      }

      return {
        reviews: result.value,
        total: result.value.length,
      };
    }
  );

  // Get audit log for an entity
  app.get(
    '/audit/:entityType/:entityId',
    {
      schema: {
        tags: ['dashboard'],
        summary: 'Get audit log for an entity',
        params: {
          type: 'object',
          properties: {
            entityType: { type: 'string', enum: ['email', 'action', 'saga'] },
            entityId: { type: 'string', format: 'uuid' },
          },
          required: ['entityType', 'entityId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              events: { type: 'array' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { entityType, entityId } = request.params as {
        entityType: 'email' | 'action' | 'saga';
        entityId: string;
      };

      let result;
      switch (entityType) {
        case 'email':
          result = await auditRepository.findByEmail(entityId);
          break;
        case 'action':
          result = await auditRepository.findByAction(entityId);
          break;
        case 'saga':
          result = await auditRepository.findBySaga(entityId);
          break;
        default:
          return reply.status(400).send({ error: 'Invalid entity type' });
      }

      if (!result.ok) {
        return reply.status(500).send({ error: result.error.message });
      }

      return { events: result.value };
    }
  );
};
